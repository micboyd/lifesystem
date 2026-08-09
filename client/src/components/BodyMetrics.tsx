import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Card } from './Card'
import Button from './Button'
import Input from './Input'
import Spinner from './Spinner'
import EmptyState from './EmptyState'
import ConfirmModal from './ConfirmModal'
import Modal from './Modal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { todayKey, parseDateKey, MONTHS } from '../lib/calendar'
import { updateSettings } from '../services/users'
import { listWeightLogs, saveWeightLog, deleteWeightLog } from '../services/weightLogs'
import {
    trendSeries,
    bodyFatSeries,
    weeklyRate,
    ratePercent,
    rateStatus,
    projectTargetDate,
    daysBetween,
    type TrendPoint,
    type BodyFatPoint,
    type RateStatus,
} from '../lib/weightTrend'
import type { BodyGoals, WeightLog } from '../types'

/** What one weigh-in submission carries. */
interface WeighInPayload {
    date: string
    weight: number
    waist?: number
    bodyFat?: number
    notes?: string
}

/** Windows the rate of change can be measured over. */
const WINDOWS = [
    { label: '2 weeks', days: 14 },
    { label: '4 weeks', days: 28 },
    { label: '8 weeks', days: 56 },
] as const

/** How far back the chart plots. Kept generous — the trend is the long game. */
const HISTORY_DAYS = 365

export default function BodyMetrics() {
    const { user, updateUser } = useAuth()
    const toast = useToast()

    const [logs, setLogs] = useState<WeightLog[] | null>(null)
    const [windowDays, setWindowDays] = useState<number>(28)
    const [editing, setEditing] = useState<WeightLog | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<WeightLog | null>(null)
    const [goalsOpen, setGoalsOpen] = useState(false)

    useEffect(() => {
        listWeightLogs()
            .then(setLogs)
            .catch(() => setLogs([]))
    }, [])

    const goals = user?.settings?.bodyGoals
    const points = useMemo(() => trendSeries(logs ?? []), [logs])
    const fatPoints = useMemo(() => bodyFatSeries(logs ?? []), [logs])
    const latestFat = fatPoints.length ? fatPoints[fatPoints.length - 1] : null
    const rate = useMemo(() => weeklyRate(points, windowDays), [points, windowDays])
    const pct = ratePercent(points, rate)
    const status = rateStatus(rate, goals?.weeklyRate)

    const latest = points.length ? points[points.length - 1] : null
    const eta =
        goals?.targetWeight != null ? projectTargetDate(points, goals.targetWeight, rate) : null

    async function handleSave(payload: WeighInPayload) {
        const saved = await saveWeightLog(payload)
        setLogs((prev) => {
            const rest = (prev ?? []).filter((l) => l.date !== saved.date)
            return [...rest, saved].sort((a, b) => a.date.localeCompare(b.date))
        })
        setEditing(null)
    }

    async function handleDelete(log: WeightLog) {
        setLogs((prev) => (prev ?? []).filter((l) => l._id !== log._id))
        try {
            await deleteWeightLog(log._id)
        } catch {
            toast.error('Could not delete that weigh-in')
            setLogs(await listWeightLogs())
        }
    }

    async function handleSaveGoals(next: BodyGoals) {
        const updated = await updateSettings({ bodyGoals: next })
        updateUser(updated)
        setGoalsOpen(false)
    }

    if (!logs) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <WeighInForm
                    key={editing?._id ?? 'new'}
                    initial={editing}
                    onSave={handleSave}
                    onCancelEdit={editing ? () => setEditing(null) : undefined}
                />
                <Button
                    variant="secondary"
                    size="sm"
                    icon="fa-solid fa-bullseye"
                    onClick={() => setGoalsOpen(true)}
                >
                    Targets
                </Button>
            </div>

            {points.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-weight-scale"
                    title="No weigh-ins yet"
                    description="Log your weight — first thing, after the loo, before eating — and the trend line builds itself. One reading tells you nothing; two weeks of them tell you everything."
                />
            ) : (
                <>
                    <div
                        className={`grid gap-4 sm:grid-cols-2 ${
                            latestFat || goals?.targetBodyFat ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
                        }`}
                    >
                        <Stat
                            label="Trend"
                            value={`${latest!.trend.toFixed(1)} kg`}
                            sub={`Last scale reading ${latest!.weight.toFixed(1)} kg`}
                        />
                        <Stat
                            label={`Rate · ${WINDOWS.find((w) => w.days === windowDays)?.label}`}
                            value={rate === null ? '—' : `${signed(rate)} kg/wk`}
                            sub={
                                pct === null
                                    ? 'Needs two weigh-ins'
                                    : `${signed(pct, 2)}% of bodyweight`
                            }
                            tone={STATUS_TONE[status]}
                        />
                        <Stat
                            label="Target"
                            value={goals?.targetWeight ? `${goals.targetWeight} kg` : '—'}
                            sub={
                                goals?.targetWeight && latest
                                    ? `${Math.abs(latest.trend - goals.targetWeight).toFixed(1)} kg to go`
                                    : 'Set one under Targets'
                            }
                        />
                        <Stat
                            label="Projected"
                            value={eta ? longDate(eta) : '—'}
                            sub={
                                eta ? `${daysBetween(todayKey(), eta)} days away` : etaHint(status)
                            }
                        />
                        {(latestFat || goals?.targetBodyFat) && (
                            <Stat
                                label="Body fat"
                                value={latestFat ? `${latestFat.trend.toFixed(1)}%` : '—'}
                                sub={bodyFatSub(latestFat, goals?.targetBodyFat)}
                            />
                        )}
                    </div>

                    <Card hover={false} className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-neutral-900">Weight trend</h3>
                                <p className="text-xs text-neutral-500">
                                    Faint dots are the scale; the line is what&rsquo;s actually
                                    happening.
                                </p>
                            </div>
                            <div className="flex gap-1">
                                {WINDOWS.map((w) => (
                                    <button
                                        key={w.days}
                                        type="button"
                                        onClick={() => setWindowDays(w.days)}
                                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                            windowDays === w.days
                                                ? 'bg-neutral-950 text-white'
                                                : 'text-neutral-500 hover:bg-neutral-100'
                                        }`}
                                    >
                                        {w.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <TrendChart
                            points={points.filter(
                                (p) => daysBetween(p.date, todayKey()) <= HISTORY_DAYS
                            )}
                            target={goals?.targetWeight}
                        />
                        <RateVerdict status={status} rate={rate} intended={goals?.weeklyRate} />
                    </Card>

                    <RecentLog
                        logs={[...logs].reverse()}
                        points={points}
                        onEdit={setEditing}
                        onDelete={setConfirmDelete}
                    />
                </>
            )}

            <GoalsModal
                key={goalsOpen ? 'open' : 'closed'}
                open={goalsOpen}
                initial={goals}
                onClose={() => setGoalsOpen(false)}
                onSave={handleSaveGoals}
            />

            <ConfirmModal
                open={!!confirmDelete}
                title="Delete this weigh-in?"
                message={
                    confirmDelete
                        ? `Remove the ${confirmDelete.weight} kg reading from ${longDate(confirmDelete.date)}? The trend will be recalculated without it.`
                        : ''
                }
                confirmLabel="Delete"
                danger
                onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
                onClose={() => setConfirmDelete(null)}
            />
        </div>
    )
}

// ─── Weigh-in entry ─────────────────────────────────────────────────────────────

/**
 * The inline weigh-in row. Doubles as the edit form: passing `initial` fills it
 * and switches the button to Save. Because the API upserts on the date, editing
 * a past day is just re-submitting it.
 */
function WeighInForm({
    initial,
    onSave,
    onCancelEdit,
}: {
    initial: WeightLog | null
    onSave: (payload: WeighInPayload) => Promise<void>
    onCancelEdit?: () => void
}) {
    const toast = useToast()
    const [date, setDate] = useState(initial?.date ?? todayKey())
    const [weight, setWeight] = useState(initial ? String(initial.weight) : '')
    const [waist, setWaist] = useState(initial?.waist ? String(initial.waist) : '')
    const [bodyFat, setBodyFat] = useState(initial?.bodyFat ? String(initial.bodyFat) : '')
    const [saving, setSaving] = useState(false)

    async function submit(e: FormEvent) {
        e.preventDefault()
        const kg = Number(weight)
        if (!Number.isFinite(kg) || kg <= 0) {
            toast.error('Enter a weight in kg')
            return
        }
        const cm = waist.trim() ? Number(waist) : undefined
        const fat = bodyFat.trim() ? Number(bodyFat) : undefined
        if (fat !== undefined && (!Number.isFinite(fat) || fat <= 0 || fat > 100)) {
            toast.error('Body fat must be a percentage between 0 and 100')
            return
        }
        setSaving(true)
        try {
            await onSave({
                date,
                weight: kg,
                waist: cm !== undefined && Number.isFinite(cm) && cm > 0 ? cm : undefined,
                bodyFat: fat,
            })
            if (!initial) {
                setWeight('')
                setWaist('')
                setBodyFat('')
            }
        } catch {
            toast.error('Could not save that weigh-in')
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="w-40">
                <Input
                    label="Date"
                    type="date"
                    value={date}
                    max={todayKey()}
                    onChange={(e) => setDate(e.target.value)}
                />
            </div>
            <div className="w-28">
                <Input
                    label="Weight (kg)"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                />
            </div>
            <div className="w-28">
                <Input
                    label="Waist (cm)"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="optional"
                    value={waist}
                    onChange={(e) => setWaist(e.target.value)}
                />
            </div>
            <div className="w-28">
                <Input
                    label="Body fat (%)"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    placeholder="optional"
                    value={bodyFat}
                    onChange={(e) => setBodyFat(e.target.value)}
                />
            </div>
            <Button type="submit" disabled={saving} icon="fa-solid fa-plus">
                {initial ? 'Save' : 'Log weigh-in'}
            </Button>
            {onCancelEdit && (
                <Button type="button" variant="ghost" onClick={onCancelEdit}>
                    Cancel
                </Button>
            )}
        </form>
    )
}

// ─── Chart ──────────────────────────────────────────────────────────────────────

const CHART_W = 720
const CHART_H = 200
const PAD_X = 8
const PAD_Y = 12

/**
 * The trend line over the raw readings, drawn to a fixed viewBox and scaled to
 * fit its container. The x-axis is real elapsed time, not point index, so a
 * fortnight's gap reads as a gap rather than a straight run of daily weigh-ins.
 */
function TrendChart({ points, target }: { points: TrendPoint[]; target?: number }) {
    if (points.length < 2) {
        return (
            <p className="py-10 text-center text-sm text-neutral-400">
                One more weigh-in and the trend line appears.
            </p>
        )
    }

    const first = points[0].date
    const span = Math.max(1, daysBetween(first, points[points.length - 1].date))

    // Include the target line in the vertical extent so it never falls off-chart.
    const values = points.flatMap((p) => [p.weight, p.trend])
    if (target) values.push(target)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = Math.max(0.5, max - min)

    const x = (date: string) => PAD_X + (daysBetween(first, date) / span) * (CHART_W - PAD_X * 2)
    const y = (v: number) => PAD_Y + (1 - (v - min) / range) * (CHART_H - PAD_Y * 2)

    const trendPath = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date)},${y(p.trend)}`)
        .join(' ')

    return (
        <div className="overflow-x-auto">
            <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="h-48 w-full min-w-[20rem]"
                role="img"
                aria-label="Bodyweight trend over time"
            >
                {target != null && (
                    <>
                        <line
                            x1={PAD_X}
                            x2={CHART_W - PAD_X}
                            y1={y(target)}
                            y2={y(target)}
                            className="stroke-emerald-500"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                        />
                        <text
                            x={CHART_W - PAD_X}
                            y={y(target) - 5}
                            textAnchor="end"
                            className="fill-emerald-600 text-[10px] font-semibold"
                        >
                            Target {target} kg
                        </text>
                    </>
                )}

                {points.map((p) => (
                    <circle
                        key={p.date}
                        cx={x(p.date)}
                        cy={y(p.weight)}
                        r={2}
                        className="fill-neutral-300"
                    />
                ))}

                <path
                    d={trendPath}
                    fill="none"
                    className="stroke-coral-500"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            </svg>
            <div className="flex justify-between px-1 text-[11px] text-neutral-400">
                <span>{longDate(first)}</span>
                <span>{longDate(points[points.length - 1].date)}</span>
            </div>
        </div>
    )
}

// ─── Verdict ────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<RateStatus, Tone> = {
    'no-goal': 'neutral',
    'no-data': 'neutral',
    'on-track': 'good',
    slow: 'warn',
    fast: 'warn',
    stalled: 'warn',
    'wrong-way': 'bad',
}

/**
 * A plain-English read on the rate. The point of the whole tab: not "here is a
 * number" but "here is what to do about it".
 */
function RateVerdict({
    status,
    rate,
    intended,
}: {
    status: RateStatus
    rate: number | null
    intended?: number
}) {
    if (status === 'no-data') return null

    const actual = rate === null ? '' : `${signed(rate)} kg/wk`
    const goal = intended ? `${signed(intended)} kg/wk` : ''

    const copy: Record<RateStatus, string> = {
        'no-data': '',
        'no-goal': `You're moving ${actual}. Set a target rate to judge whether that's the pace you want.`,
        'on-track': `${actual} against a ${goal} target — this is working. Change nothing.`,
        slow: `${actual} against a ${goal} target. Before cutting calories further, check the intake log is honest — an unlogged snack is the usual culprit.`,
        fast: `${actual} against a ${goal} target. Faster isn't better: past about 1% of bodyweight a week you start paying in muscle. Consider eating a little more.`,
        stalled: `The trend is flat. Give it another week before reacting — but if it holds, the deficit has closed and intake or activity needs to change.`,
        'wrong-way': `You're moving ${actual} while aiming for ${goal}. Two weeks of this means the deficit isn't there, whatever the plan says.`,
    }

    const tone = STATUS_TONE[status]
    const box =
        tone === 'good'
            ? 'bg-emerald-50 text-emerald-700'
            : tone === 'warn'
              ? 'bg-amber-50 text-amber-800'
              : tone === 'bad'
                ? 'bg-red-50 text-red-700'
                : 'bg-neutral-50 text-neutral-600'

    return <p className={`rounded-2xl px-4 py-3 text-sm ${box}`}>{copy[status]}</p>
}

// ─── Recent log ─────────────────────────────────────────────────────────────────

function RecentLog({
    logs,
    points,
    onEdit,
    onDelete,
}: {
    logs: WeightLog[]
    points: TrendPoint[]
    onEdit: (log: WeightLog) => void
    onDelete: (log: WeightLog) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const trendByDate = useMemo(() => new Map(points.map((p) => [p.date, p.trend])), [points])
    const shown = expanded ? logs : logs.slice(0, 10)

    return (
        <Card hover={false} flush className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
                <h3 className="text-sm font-bold text-neutral-900">Weigh-ins</h3>
                <span className="text-xs text-neutral-400">{logs.length} recorded</span>
            </div>
            <ul className="divide-y divide-neutral-100">
                {shown.map((log) => (
                    <li key={log._id} className="group flex items-center gap-4 px-6 py-3">
                        <span className="w-28 shrink-0 text-sm text-neutral-500">
                            {longDate(log.date)}
                        </span>
                        <span className="w-20 text-sm font-semibold tabular-nums text-neutral-900">
                            {log.weight.toFixed(1)} kg
                        </span>
                        <span className="w-24 text-sm tabular-nums text-neutral-400">
                            {trendByDate.has(log.date)
                                ? `${trendByDate.get(log.date)!.toFixed(1)} trend`
                                : ''}
                        </span>
                        <span className="w-24 text-sm tabular-nums text-neutral-400">
                            {log.waist ? `${log.waist} cm waist` : ''}
                        </span>
                        <span className="flex-1 text-sm tabular-nums text-neutral-400">
                            {log.bodyFat ? `${log.bodyFat.toFixed(1)}% fat` : ''}
                        </span>
                        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <RowButton
                                icon="fa-solid fa-pen"
                                label={`Edit ${log.date}`}
                                onClick={() => onEdit(log)}
                            />
                            <RowButton
                                icon="fa-solid fa-trash"
                                label={`Delete ${log.date}`}
                                danger
                                onClick={() => onDelete(log)}
                            />
                        </div>
                    </li>
                ))}
            </ul>
            {logs.length > 10 && (
                <div className="border-t border-neutral-100 px-6 py-3">
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
                    >
                        {expanded ? 'Show less' : `Show all ${logs.length}`}
                    </button>
                </div>
            )}
        </Card>
    )
}

function RowButton({
    icon,
    label,
    onClick,
    danger = false,
}: {
    icon: string
    label: string
    onClick: () => void
    danger?: boolean
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={`grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors ${
                danger
                    ? 'hover:bg-red-50 hover:text-red-500'
                    : 'hover:bg-neutral-100 hover:text-neutral-900'
            }`}
        >
            <i className={`${icon} text-[11px]`} aria-hidden="true" />
        </button>
    )
}

// ─── Targets ────────────────────────────────────────────────────────────────────

/**
 * Target weight, body fat and intended weekly rate. The rate is entered as a
 * positive number of kg per week alongside a direction, because "-0.5" is an
 * awkward thing to type; it's stored signed.
 */
function GoalsModal({
    open,
    initial,
    onClose,
    onSave,
}: {
    open: boolean
    initial?: BodyGoals
    onClose: () => void
    onSave: (next: BodyGoals) => Promise<void>
}) {
    const toast = useToast()
    // Seeded from settings on mount; the caller keys this component on `open` so
    // a cancelled edit is discarded by remounting rather than by an effect.
    const [target, setTarget] = useState(initial?.targetWeight ? String(initial.targetWeight) : '')
    const [rate, setRate] = useState(
        initial?.weeklyRate ? String(Math.abs(initial.weeklyRate)) : ''
    )
    const [losing, setLosing] = useState((initial?.weeklyRate ?? -0.5) < 0)
    const [fat, setFat] = useState(initial?.targetBodyFat ? String(initial.targetBodyFat) : '')
    const [saving, setSaving] = useState(false)

    async function submit() {
        const t = target.trim() ? Number(target) : undefined
        const r = rate.trim() ? Number(rate) : undefined
        if (t !== undefined && (!Number.isFinite(t) || t <= 0)) {
            toast.error('Target weight must be a positive number')
            return
        }
        if (r !== undefined && (!Number.isFinite(r) || r <= 0)) {
            toast.error('Weekly rate must be a positive number')
            return
        }
        const f = fat.trim() ? Number(fat) : undefined
        if (f !== undefined && (!Number.isFinite(f) || f <= 0 || f > 100)) {
            toast.error('Target body fat must be a percentage between 0 and 100')
            return
        }
        setSaving(true)
        try {
            await onSave({
                targetWeight: t,
                weeklyRate: r === undefined ? undefined : losing ? -r : r,
                targetBodyFat: f,
            })
        } catch {
            toast.error('Could not save your targets')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Body targets"
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <Input
                    label="Target weight (kg)"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="e.g. 78"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                />
                <Input
                    label="Target body fat (%)"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    placeholder="e.g. 15"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    hint="Judged on the trend, not one reading — measure the same way each time."
                />
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Direction
                    </span>
                    <div className="flex gap-2">
                        {[
                            { label: 'Losing', value: true },
                            { label: 'Gaining', value: false },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                onClick={() => setLosing(opt.value)}
                                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                                    losing === opt.value
                                        ? 'bg-neutral-950 text-white'
                                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <Input
                    label="Rate (kg per week)"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="e.g. 0.5"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    hint="0.5–1% of bodyweight a week is the usual sustainable range for a cut."
                />
            </div>
        </Modal>
    )
}

// ─── Bits ───────────────────────────────────────────────────────────────────────

type Tone = 'neutral' | 'good' | 'warn' | 'bad'

const TONE_TEXT: Record<Tone, string> = {
    neutral: 'text-neutral-900',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
}

function Stat({
    label,
    value,
    sub,
    tone = 'neutral',
}: {
    label: string
    value: string
    sub?: string
    tone?: Tone
}) {
    return (
        <Card hover={false} className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
            {sub && <p className="text-xs text-neutral-400">{sub}</p>}
        </Card>
    )
}

/** "-0.4" / "+0.4" — the sign carries the meaning, so it's always shown. */
function signed(n: number, dp = 1): string {
    return `${n > 0 ? '+' : ''}${n.toFixed(dp)}`
}

/** "4 Aug 2026" */
function longDate(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return `${day} ${MONTHS[month].slice(0, 3)} ${year}`
}

/**
 * The line under the body-fat tile. The tile shows the smoothed trend, so the
 * last raw reading goes here — and the gap to the target when one is set, in
 * percentage points, since "% to go" would read as a percentage of a percentage.
 */
function bodyFatSub(latest: BodyFatPoint | null, target?: number): string {
    // The tile only shows when there's a reading or a target, so no reading here
    // always means a target is set and waiting for one.
    if (!latest) return `Target ${target}% · add a reading to a weigh-in`
    const reading = `Last reading ${latest.bodyFat.toFixed(1)}%`
    if (target == null) return reading
    const gap = latest.trend - target
    if (Math.abs(gap) < 0.05) return `At your ${target}% target`
    return `${Math.abs(gap).toFixed(1)} points ${gap > 0 ? 'to go' : 'past'} · target ${target}%`
}

/** Why there's no projection, phrased for the reason. */
function etaHint(status: RateStatus): string {
    if (status === 'wrong-way') return 'Moving away from the target'
    if (status === 'stalled') return 'Trend is flat'
    return 'Needs a target and a rate'
}
