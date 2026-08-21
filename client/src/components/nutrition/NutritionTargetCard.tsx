import type { Macros, MacroGoals } from '../../types'
import type { DayType } from '../../lib/nutritionTargets'
import { DAY_TYPE_LABELS } from '../../lib/nutritionTargets'
import type { Verdict } from '../../lib/energy'
import { fmt, kcal, signedKcal } from './format'

/**
 * What to eat today, and how much of it is left.
 *
 * The hierarchy is the argument. Calories and protein are the two numbers that
 * decide whether a recomp works — one sets the direction, the other decides
 * whether what comes off is fat or muscle — so they get the headline treatment
 * and carbs and fat get a line each. A four-macro grid of equal weight reads as
 * four equally important jobs, and they aren't.
 *
 * Every figure is split three ways: eaten, still planned, and the projection if
 * the day goes as written. Collapsing those loses the distinction between a day
 * that went well and a day that hasn't happened yet.
 */

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

/**
 * Eaten solid, still-planned hatched on behind it, the target marked. A
 * half-eaten day should read as half-eaten rather than as a triumph of restraint,
 * which is what a single bar of the eaten figure would show.
 */
function SplitBar({
    eaten,
    pending,
    target,
    verdict,
    thin = false,
}: {
    eaten: number
    pending: number
    target?: number
    verdict: Verdict
    thin?: boolean
}) {
    const span = Math.max(eaten + pending, target ?? 0, 1)
    const pct = (v: number) => `${Math.min(100, (v / span) * 100)}%`

    return (
        <div
            className={`relative w-full overflow-hidden rounded-full bg-neutral-100 ${thin ? 'h-1.5' : 'h-2.5'}`}
        >
            <div
                className={`absolute inset-y-0 left-0 rounded-full ${VERDICT_BAR[verdict]}`}
                style={{ width: pct(eaten) }}
            />
            <div
                className="absolute inset-y-0 rounded-r-full bg-neutral-200"
                style={{ left: pct(eaten), width: pct(pending) }}
            />
            {target ? (
                <div
                    className="absolute inset-y-0 w-0.5 bg-neutral-900"
                    style={{ left: pct(target) }}
                    aria-hidden="true"
                />
            ) : null}
        </div>
    )
}

/** A headline macro: the two that decide whether the phase works. */
function Primary({
    label,
    unit,
    eaten,
    pending,
    target,
    verdict,
}: {
    label: string
    unit: string
    eaten: number
    pending: number
    target?: number
    verdict: Verdict
}) {
    const projected = eaten + pending
    // Remaining is measured against the projection, not against what's eaten:
    // food already on the plan isn't headroom you still have.
    const remaining = target === undefined ? null : target - projected

    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
                <span
                    className={`text-2xl font-bold tabular-nums tracking-tight sm:text-3xl ${VERDICT_TEXT[verdict]}`}
                >
                    {label === 'Calories' ? kcal(eaten) : fmt(eaten)}
                </span>
                <span className="text-sm font-medium tabular-nums text-neutral-400">
                    {target ? `/ ${label === 'Calories' ? kcal(target) : fmt(target)}` : ''} {unit}
                </span>
            </p>
            <div className="mt-2">
                <SplitBar eaten={eaten} pending={pending} target={target} verdict={verdict} />
            </div>
            <p className="mt-1.5 text-[11px] tabular-nums text-neutral-400">
                {pending > 0 && (
                    <span className="text-neutral-500">
                        +{label === 'Calories' ? kcal(pending) : fmt(pending)} planned
                    </span>
                )}
                {pending > 0 && remaining !== null && ' · '}
                {remaining !== null &&
                    (remaining >= 0
                        ? `${label === 'Calories' ? kcal(remaining) : fmt(remaining)} ${unit} left`
                        : `${label === 'Calories' ? kcal(-remaining) : fmt(-remaining)} ${unit} over`)}
                {pending === 0 && remaining === null && 'No target set'}
            </p>
        </div>
    )
}

/** Carbs and fat: real targets, but not the ones the phase lives or dies on. */
function Secondary({
    label,
    eaten,
    pending,
    target,
    verdict,
}: {
    label: string
    eaten: number
    pending: number
    target?: number
    verdict: Verdict
}) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </span>
            <div className="min-w-0 flex-1">
                <SplitBar eaten={eaten} pending={pending} target={target} verdict={verdict} thin />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                <span className={`font-bold ${VERDICT_TEXT[verdict]}`}>{fmt(eaten)}</span>
                {target ? <span className="text-neutral-400"> / {fmt(target)}</span> : null}
                <span className="ml-0.5 text-neutral-300">g</span>
            </span>
        </div>
    )
}

export default function NutritionTargetCard({
    eaten,
    pending,
    goals,
    verdicts,
    dayType,
    modifier,
    expenditure,
    expenditureSource,
    projectedBalance,
    maintenanceKcal,
}: {
    eaten: Macros
    pending: Macros
    goals: MacroGoals | null
    verdicts: { calories: Verdict; protein: Verdict; carbs: Verdict; fat: Verdict }
    dayType: DayType | null
    /** The activity shift applied to today's calorie target, signed. */
    modifier: number
    /** Today's logged expenditure, or null when it wasn't recorded. */
    expenditure: number | null
    expenditureSource: 'logged' | 'maintenance' | 'unknown'
    projectedBalance: number | null
    maintenanceKcal: number | null
}) {
    return (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold tracking-tight text-neutral-900">Today</h3>
                {modifier !== 0 && dayType && (
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                        {DAY_TYPE_LABELS[dayType]} day · {signedKcal(modifier)} kcal
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Primary
                    label="Calories"
                    unit="kcal"
                    eaten={eaten.calories}
                    pending={pending.calories}
                    target={goals?.calories}
                    verdict={verdicts.calories}
                />
                <Primary
                    label="Protein"
                    unit="g"
                    eaten={eaten.protein}
                    pending={pending.protein}
                    target={goals?.protein}
                    verdict={verdicts.protein}
                />
            </div>

            <div className="mt-5 flex flex-col gap-2.5 border-t border-neutral-100 pt-4">
                <Secondary
                    label="Carbs"
                    eaten={eaten.carbs}
                    pending={pending.carbs}
                    target={goals?.carbs}
                    verdict={verdicts.carbs}
                />
                <Secondary
                    label="Fat"
                    eaten={eaten.fat}
                    pending={pending.fat}
                    target={goals?.fat}
                    verdict={verdicts.fat}
                />
            </div>

            {/*
              Energy sits below the targets and reads as context, not as an
              instruction. A watch saying you burned 3,400 today is interesting;
              it is not permission to eat 3,400. The target above comes from the
              phase and the long-run trend, which is the only thing that has been
              checked against your actual bodyweight.
            */}
            <div className="mt-5 border-t border-neutral-100 pt-4">
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                            Burned today
                        </p>
                        <p
                            className={`mt-0.5 text-sm font-bold tabular-nums ${
                                expenditureSource === 'logged' ? 'text-neutral-900' : 'text-neutral-300'
                            }`}
                        >
                            {expenditureSource === 'logged' && expenditure !== null
                                ? `${kcal(expenditure)} kcal`
                                : 'Unknown'}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                            Day balance
                        </p>
                        <p
                            className={`mt-0.5 text-sm font-bold tabular-nums ${
                                projectedBalance === null ? 'text-neutral-300' : 'text-neutral-700'
                            }`}
                        >
                            {projectedBalance === null ? '—' : `${signedKcal(projectedBalance)} kcal`}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                            Maintenance
                        </p>
                        <p
                            className={`mt-0.5 text-sm font-bold tabular-nums ${
                                maintenanceKcal === null ? 'text-neutral-300' : 'text-neutral-700'
                            }`}
                        >
                            {maintenanceKcal === null ? 'Unknown' : `${kcal(maintenanceKcal)} kcal`}
                        </p>
                    </div>
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">
                    Expenditure is context, not a budget to spend — your target comes from the phase
                    and your measured trend, not from today&rsquo;s watch reading.
                </p>
            </div>
        </div>
    )
}
