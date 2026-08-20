import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../Button'
import Input from '../Input'
import Spinner from '../Spinner'
import EmptyState from '../EmptyState'
import { listPlanEntries, setEntryStatus } from '../../services/mealPlan'
import { listWeightLogs } from '../../services/weightLogs'
import { listNutritionPhases } from '../../services/nutritionPhases'
import {
    listDailyEnergy,
    saveDailyEnergy,
    deleteDailyEnergy,
} from '../../services/dailyEnergy'
import { addDays, todayKey } from '../../lib/calendar'
import { entryMacros, entryName, sumEatenMacros, targetsFor } from '../../lib/nutrition'
import { trendSeries } from '../../lib/weightTrend'
import {
    dailyIntake,
    measuredMaintenance,
    dayEnergy,
    targetVerdict,
    balanceVerdict,
    impliedWeeklyRate,
    MAINTENANCE_WINDOW_DAYS,
    type Verdict,
    type Maintenance,
    type MaintenanceGap,
} from '../../lib/energy'
import { MEAL_TYPES } from '../../types'
import type {
    DailyEnergy,
    EntryStatus,
    MacroGoals,
    Macros,
    MealPlanEntry,
    NutritionPhase,
    NutritionPhaseKind,
    WeightLog,
} from '../../types'

/**
 * The day, as calories in against calories out.
 *
 * The weekly planner is where a week gets designed; this is where a day gets
 * lived. It answers two questions side by side — did I eat what the phase asked
 * for, and was the day actually a deficit — and colours both through the phase's
 * mode, since a surplus is a bulk working and a cut failing.
 */

// ── Formatting ────────────────────────────────────────────────────────────────

/** Whole numbers plain, decimals to one place. */
function fmt(n: number): string {
    const v = Number(n)
    if (!Number.isFinite(v)) return '0'
    return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** Rounded to the nearest whole calorie, with a thousands separator. */
function kcal(n: number): string {
    return Math.round(n).toLocaleString()
}

/** A signed calorie figure — the sign is the whole message. */
function signed(n: number): string {
    const rounded = Math.round(n)
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString()}`
}

const VERDICT_TEXT: Record<Verdict, string> = {
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
    none: 'text-neutral-400',
}

const VERDICT_BAR: Record<Verdict, string> = {
    good: 'bg-emerald-500',
    warn: 'bg-amber-400',
    bad: 'bg-red-500',
    none: 'bg-neutral-300',
}

const KIND_LABEL: Record<NutritionPhaseKind, string> = {
    cut: 'Cut',
    maintain: 'Maintain',
    gain: 'Bulk',
}

const KIND_CHIP: Record<NutritionPhaseKind, string> = {
    cut: 'bg-sky-50 text-sky-700',
    maintain: 'bg-neutral-100 text-neutral-600',
    gain: 'bg-marigold/20 text-amber-700',
}

// ── Pieces ────────────────────────────────────────────────────────────────────

/**
 * The three headline figures. `out` carries its own caption because where the
 * number came from changes how much weight to put on it — a watch reading and a
 * figure inferred from the scale are not the same claim.
 */
function Headline({
    label,
    value,
    caption,
    tone = 'text-neutral-900',
}: {
    label: string
    value: string
    caption?: string
    tone?: string
}) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p className={`mt-0.5 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl ${tone}`}>
                {value}
            </p>
            {caption && <p className="mt-0.5 truncate text-[11px] text-neutral-400">{caption}</p>}
        </div>
    )
}

/**
 * Intake against expenditure. Eaten is solid; what's still planned is hatched on
 * behind it, so a half-eaten day reads as half-eaten rather than as a triumph of
 * self-control. The expenditure line is the mark to reach, not a cap.
 */
function IntakeBar({
    eaten,
    pending,
    out,
    verdict,
}: {
    eaten: number
    pending: number
    out: number | null
    verdict: Verdict
}) {
    // Scale to whichever is larger so neither bar ever runs off the end.
    const span = Math.max(eaten + pending, out ?? 0, 1)
    const pct = (v: number) => `${Math.min(100, (v / span) * 100)}%`

    return (
        <div className="mt-4">
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                    className={`absolute inset-y-0 left-0 rounded-full ${VERDICT_BAR[verdict]}`}
                    style={{ width: pct(eaten) }}
                />
                <div
                    className="absolute inset-y-0 rounded-r-full bg-neutral-200"
                    style={{ left: pct(eaten), width: pct(pending) }}
                />
                {out !== null && (
                    <div
                        className="absolute inset-y-0 w-0.5 bg-neutral-900"
                        style={{ left: pct(out) }}
                        aria-hidden="true"
                    />
                )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-400">
                <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${VERDICT_BAR[verdict]}`} />
                    Eaten {kcal(eaten)}
                </span>
                {pending > 0 && (
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-neutral-200" />
                        Still planned {kcal(pending)}
                    </span>
                )}
                {out !== null && (
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-0.5 bg-neutral-900" />
                        Out {kcal(out)}
                    </span>
                )}
            </div>
        </div>
    )
}

/** One macro against its target, with a bar and a met/over readout. */
function MacroRow({
    label,
    unit,
    value,
    target,
    verdict,
}: {
    label: string
    unit: string
    value: number
    target?: number
    verdict: Verdict
}) {
    const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0
    return (
        <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                    className={`h-full rounded-full ${VERDICT_BAR[verdict]}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                <span className={`font-bold ${VERDICT_TEXT[verdict]}`}>{fmt(value)}</span>
                {target ? (
                    <span className="text-neutral-400"> / {fmt(target)}</span>
                ) : null}
                <span className="ml-0.5 text-neutral-300">{unit}</span>
            </span>
        </div>
    )
}

/** The manual burn entry — one number, saved or cleared. */
function BurnEntry({
    logged,
    fallback,
    onSave,
    onClear,
}: {
    logged: DailyEnergy | null
    fallback: Maintenance | MaintenanceGap
    onSave: (kcal: number) => Promise<void>
    onClear: () => Promise<void>
}) {
    const [value, setValue] = useState(logged ? String(logged.caloriesOut) : '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function submit() {
        const n = Number(value)
        if (!value.trim() || !Number.isFinite(n) || n <= 0) {
            setError('Enter a positive number')
            return
        }
        setError('')
        setBusy(true)
        try {
            await onSave(n)
        } catch {
            setError('Could not save that')
        } finally {
            setBusy(false)
        }
    }

    async function clear() {
        setBusy(true)
        try {
            await onClear()
        } finally {
            setBusy(false)
        }
    }

    const hint =
        typeof fallback === 'object'
            ? `Unset, so today falls back to your measured maintenance of ${kcal(fallback.kcal)} kcal.`
            : 'Total for the whole day — resting plus movement, as your watch reports it.'

    return (
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="w-36">
                    <Input
                        label="Calories out"
                        type="number"
                        inputMode="numeric"
                        placeholder="2,500"
                        value={value}
                        error={error}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submit()
                        }}
                    />
                </div>
                <Button onClick={submit} disabled={busy}>
                    Save
                </Button>
                {logged && (
                    <Button variant="ghost" onClick={clear} disabled={busy}>
                        Clear
                    </Button>
                )}
            </div>
            {!error && <p className="mt-2 text-[11px] text-neutral-400">{logged ? 'Total for the whole day — resting plus movement.' : hint}</p>}
        </div>
    )
}

/** Today's meals, tickable — so logging the day never means leaving this tab. */
function MealList({
    entries,
    onSetStatus,
}: {
    entries: MealPlanEntry[]
    onSetStatus: (id: string, status: EntryStatus) => void
}) {
    const bySlot = MEAL_TYPES.map((slot) => ({
        slot,
        meals: entries.filter((e) => e.slot === slot),
    })).filter((g) => g.meals.length > 0)

    if (bySlot.length === 0) {
        return (
            <p className="rounded-2xl border border-dashed border-neutral-200 py-6 text-center text-sm text-neutral-400">
                Nothing planned for today.{' '}
                <Link to="/nutrition" className="font-semibold text-neutral-700 underline">
                    Plan the week
                </Link>
            </p>
        )
    }

    return (
        <ul className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-100">
            {bySlot.map(({ slot, meals }) =>
                meals.map((e) => {
                    const eaten = e.status === 'eaten'
                    const skipped = e.status === 'skipped'
                    const m = entryMacros(e)
                    const servings = e.servings ?? 1
                    return (
                        <li key={e._id} className="flex items-center gap-3 px-3 py-2.5">
                            <button
                                type="button"
                                aria-label={`${eaten ? 'Unmark' : 'Mark eaten'}: ${entryName(e)}`}
                                onClick={() => onSetStatus(e._id, eaten ? 'planned' : 'eaten')}
                                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${
                                    eaten
                                        ? 'text-emerald-500'
                                        : 'text-neutral-300 hover:text-emerald-500'
                                }`}
                            >
                                <i
                                    className={
                                        eaten
                                            ? 'fa-solid fa-circle-check text-sm'
                                            : 'fa-regular fa-circle text-sm'
                                    }
                                    aria-hidden="true"
                                />
                            </button>
                            <div className="min-w-0 flex-1">
                                <p
                                    className={`truncate text-[13px] font-semibold text-neutral-800 ${
                                        skipped ? 'line-through opacity-50' : ''
                                    }`}
                                >
                                    {entryName(e)}
                                    {servings !== 1 && (
                                        <span className="ml-1.5 text-[11px] font-bold text-neutral-400">
                                            ×{fmt(servings)}
                                        </span>
                                    )}
                                </p>
                                <p className="text-[11px] capitalize tabular-nums text-neutral-400">
                                    {slot} · {kcal(m.calories)} kcal · P{fmt(m.protein)} C
                                    {fmt(m.carbs)} F{fmt(m.fat)}
                                </p>
                            </div>
                        </li>
                    )
                })
            )}
        </ul>
    )
}

// ── The tab ───────────────────────────────────────────────────────────────────

export default function TodayTab({ settingsGoals }: { settingsGoals?: MacroGoals }) {
    const today = todayKey()
    const windowStart = addDays(today, -MAINTENANCE_WINDOW_DAYS)

    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [logs, setLogs] = useState<WeightLog[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [burns, setBurns] = useState<DailyEnergy[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(() => {
        Promise.all([
            listPlanEntries(windowStart, today),
            listWeightLogs(addDays(today, -180)),
            listNutritionPhases(today, today),
            listDailyEnergy(windowStart, today),
        ])
            .then(([e, w, p, b]) => {
                setEntries(e)
                setLogs(w)
                setPhases(p)
                setBurns(b)
            })
            .finally(() => setLoading(false))
    }, [windowStart, today])

    useEffect(load, [load])

    const todayEntries = useMemo(() => entries.filter((e) => e.date === today), [entries, today])
    const loggedBurn = useMemo(
        () => burns.find((b) => b.date === today) ?? null,
        [burns, today]
    )

    const maintenance = useMemo(
        () => measuredMaintenance(dailyIntake(entries), trendSeries(logs), MAINTENANCE_WINDOW_DAYS, today),
        [entries, logs, today]
    )

    const day = useMemo(
        () => dayEnergy(todayEntries, loggedBurn, maintenance),
        [todayEntries, loggedBurn, maintenance]
    )

    const { goals, source, phase } = useMemo(
        () => targetsFor(today, phases, settingsGoals),
        [today, phases, settingsGoals]
    )
    const kind = phase?.kind ?? null

    const eatenMacros: Macros = useMemo(() => sumEatenMacros(todayEntries), [todayEntries])

    // Judged on the projected day rather than the eaten-so-far figure: before
    // dinner every day looks like a heroic deficit, and colouring it green then
    // would train you to trust a number that hasn't happened yet.
    const balanceForVerdict = day.pending > 0 ? day.projectedBalance : day.balance
    const balVerdict = balanceVerdict(balanceForVerdict, kind)
    const calVerdict = targetVerdict(day.projected, goals?.calories, kind)
    const impliedRate = impliedWeeklyRate(balanceForVerdict)

    async function handleSetStatus(id: string, status: EntryStatus) {
        const previous = entries.find((e) => e._id === id)?.status
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, status } : e)))
        try {
            await setEntryStatus(id, status)
        } catch {
            if (previous) {
                setEntries((prev) =>
                    prev.map((e) => (e._id === id ? { ...e, status: previous } : e))
                )
            }
        }
    }

    async function handleSaveBurn(value: number) {
        const saved = await saveDailyEnergy(today, value)
        setBurns((prev) => [...prev.filter((b) => b.date !== today), saved])
    }

    async function handleClearBurn() {
        await deleteDailyEnergy(today)
        setBurns((prev) => prev.filter((b) => b.date !== today))
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const outCaption =
        day.source === 'logged'
            ? 'Logged'
            : day.source === 'maintenance'
              ? 'Estimated from your trend'
              : 'Not logged'

    return (
        <div className="flex flex-col gap-4">
            {/* What today is being judged against, and where that came from. */}
            <div className="flex flex-wrap items-center gap-2">
                {phase ? (
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${KIND_CHIP[phase.kind]}`}
                    >
                        <i className="fa-solid fa-flag text-[10px]" aria-hidden="true" />
                        {phase.name} · {KIND_LABEL[phase.kind]}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-500">
                        No phase today
                    </span>
                )}
                <span className="text-[11px] text-neutral-400">
                    {source === 'phase'
                        ? 'Targets from this phase'
                        : source === 'settings'
                          ? 'Targets from your standing goals'
                          : 'No targets set'}
                </span>
                {source !== 'phase' && (
                    <Link
                        to="/life-plan"
                        className="text-[11px] font-semibold text-neutral-600 underline"
                    >
                        Set up a phase
                    </Link>
                )}
            </div>

            {/* In / out / balance. */}
            <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Headline
                        label="Calories in"
                        value={kcal(day.eaten)}
                        caption={day.pending > 0 ? `${kcal(day.projected)} if today goes to plan` : 'Day logged'}
                    />
                    <Headline
                        label="Calories out"
                        value={day.out === null ? '—' : kcal(day.out)}
                        caption={outCaption}
                        tone={day.out === null ? 'text-neutral-300' : 'text-neutral-900'}
                    />
                    <div className="col-span-2 sm:col-span-1">
                        <Headline
                            label={
                                balanceForVerdict === null
                                    ? 'Balance'
                                    : balanceForVerdict < 0
                                      ? 'Deficit'
                                      : 'Surplus'
                            }
                            value={
                                balanceForVerdict === null ? '—' : signed(balanceForVerdict)
                            }
                            tone={VERDICT_TEXT[balVerdict]}
                            caption={
                                impliedRate === null
                                    ? undefined
                                    : `${impliedRate > 0 ? '+' : '−'}${Math.abs(impliedRate).toFixed(2)} kg/week at this rate`
                            }
                        />
                    </div>
                </div>

                <IntakeBar
                    eaten={day.eaten}
                    pending={day.pending}
                    out={day.out}
                    verdict={balVerdict}
                />

                {/* The one line that says what to do about it. */}
                <p className="mt-3 text-xs text-neutral-500">
                    {verdictLine(balVerdict, kind, day.source, maintenance)}
                </p>
            </div>

            <BurnEntry
                key={loggedBurn?.caloriesOut ?? 'unset'}
                logged={loggedBurn}
                fallback={maintenance}
                onSave={handleSaveBurn}
                onClear={handleClearBurn}
            />

            {/* Macros against the resolved target. */}
            <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-bold tracking-tight text-neutral-900">
                        Against target
                    </h3>
                    <span className="text-[11px] text-neutral-400">
                        {day.pending > 0 ? 'Projected, if today goes to plan' : 'Eaten today'}
                    </span>
                </div>
                {goals ? (
                    <div className="flex flex-col gap-2.5">
                        <MacroRow
                            label="Calories"
                            unit="kcal"
                            value={day.pending > 0 ? day.projected : day.eaten}
                            target={goals.calories}
                            verdict={calVerdict}
                        />
                        <MacroRow
                            label="Protein"
                            unit="g"
                            value={eatenMacros.protein}
                            target={goals.protein}
                            verdict={macroVerdict(eatenMacros.protein, goals.protein, 'protein', kind)}
                        />
                        <MacroRow
                            label="Carbs"
                            unit="g"
                            value={eatenMacros.carbs}
                            target={goals.carbs}
                            verdict={macroVerdict(eatenMacros.carbs, goals.carbs, 'other', kind)}
                        />
                        <MacroRow
                            label="Fat"
                            unit="g"
                            value={eatenMacros.fat}
                            target={goals.fat}
                            verdict={macroVerdict(eatenMacros.fat, goals.fat, 'other', kind)}
                        />
                    </div>
                ) : (
                    <EmptyState
                        icon="fa-solid fa-bullseye"
                        title="No targets to measure against"
                        description="Set macro goals in settings, or start a nutrition phase to give this stretch its own numbers."
                    />
                )}
            </div>

            {/* Today's food. */}
            <div>
                <h3 className="mb-2 text-sm font-bold tracking-tight text-neutral-900">
                    Today&rsquo;s meals
                </h3>
                <MealList entries={todayEntries} onSetStatus={handleSetStatus} />
            </div>
        </div>
    )
}

/**
 * Protein is the one macro where hitting the floor is the whole job — on a cut
 * it's what keeps the weight coming off muscle-free — so undershooting it is a
 * miss regardless of mode, while overshooting is never a problem. The others
 * read as ordinary two-sided targets.
 */
function macroVerdict(
    value: number,
    target: number | undefined,
    role: 'protein' | 'other',
    kind: NutritionPhaseKind | null
): Verdict {
    if (!target || target <= 0) return 'none'
    if (role === 'protein') {
        if (value >= target) return 'good'
        return value >= target * 0.85 ? 'warn' : 'bad'
    }
    return targetVerdict(value, target, kind)
}

/** The sentence under the bar: what the balance means, in words. */
function verdictLine(
    verdict: Verdict,
    kind: NutritionPhaseKind | null,
    source: 'logged' | 'maintenance' | 'unknown',
    maintenance: Maintenance | MaintenanceGap
): string {
    if (source === 'unknown') {
        if (maintenance === 'not-enough-intake') {
            return 'Log a burn figure above, or keep marking meals eaten — a fortnight of logged days is enough to measure your maintenance from the scale.'
        }
        if (maintenance === 'not-enough-weight') {
            return 'Log a burn figure above, or add a few weigh-ins — the trend is what turns your intake into a maintenance figure.'
        }
        return 'No expenditure figure for today yet.'
    }

    const mode = kind === 'gain' ? 'bulk' : kind === 'maintain' ? 'maintenance' : 'cut'
    switch (verdict) {
        case 'good':
            return kind === 'maintain'
                ? 'Close enough to level — that is the job on a maintenance phase.'
                : `On plan for a ${mode}.`
        case 'warn':
            return kind === 'maintain'
                ? 'Drifting away from level today.'
                : `Around maintenance — no real progress either way on a ${mode}.`
        case 'bad':
            return kind === 'gain'
                ? 'A deficit on a bulk — this day costs you ground.'
                : `A surplus on a ${mode} — today works against the phase.`
        default:
            return ''
    }
}
