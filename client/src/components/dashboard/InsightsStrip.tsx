import { useEffect, useState } from 'react'
import StatCard from './StatCard'
import { useAuth } from '../../context/AuthContext'
import { useDataVersion } from '../../context/DataSyncContext'
import { listHabits, listLogs } from '../../services/habits'
import { listTasks } from '../../services/tasks'
import { listTimeboxes } from '../../services/timeboxes'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
} from '../../services/finances'
import { computeBudgetDay, computeBudgetWeek, monthOf, clampedWeekRange } from '../../lib/budget'
import { rowVisibleInMonth } from '../../lib/finance'
import { addDays } from '../../lib/calendar'
import { formatMoney } from '../../lib/money'
import { useMoneyHidden } from '../useMoneyHidden'
import { timeToMinutes, formatDuration, DEFAULT_WAKE, DEFAULT_BED } from '../../lib/time'
import type {
    HabitDef,
    HabitLog,
    Task,
    Timebox,
    FinanceGroup,
    FinanceRow,
    FinanceEntry,
    BudgetSpend,
} from '../../types'

/** How far back to look when computing the habit streak. */
const STREAK_WINDOW = 30

interface Insight {
    label: string
    value: string
    icon: string
    trend?: string
    trendVariant?: 'success' | 'warning' | 'danger'
    sub?: string
    subVariant?: 'success' | 'danger' | 'neutral'
}

/** Money with the sign outside the symbol, e.g. -12.5 → "-£12.50". */
const money = formatMoney

// ── Per-metric calculations ─────────────────────────────────────────────────────

function habitInsight(habits: HabitDef[], logs: HabitLog[], date: string): Insight {
    const active = habits.filter((h) => h.active)
    if (active.length === 0) {
        return { label: 'Habits today', value: '—', icon: 'fa-solid fa-seedling' }
    }

    const completedOn = (d: string) =>
        new Set(logs.filter((l) => l.date === d && l.completed).map((l) => l.habit))
    const isPerfect = (d: string) => active.every((h) => completedOn(d).has(h._id))

    const doneToday = active.filter((h) => completedOn(date).has(h._id)).length

    // Count back from today; an incomplete today doesn't break a prior streak.
    let streak = 0
    let cursor = isPerfect(date) ? date : addDays(date, -1)
    for (let i = 0; i < STREAK_WINDOW && isPerfect(cursor); i++) {
        streak++
        cursor = addDays(cursor, -1)
    }

    return {
        label: 'Habits today',
        value: `${doneToday}/${active.length}`,
        icon: 'fa-solid fa-fire',
        trend: streak > 0 ? `${streak}-day streak${streak >= STREAK_WINDOW ? '+' : ''}` : undefined,
        trendVariant: 'success',
    }
}

function taskInsight(tasks: Task[]): Insight {
    const done = tasks.filter((t) => t.completed).length
    const total = tasks.length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return {
        label: 'Tasks done',
        value: total > 0 ? `${done}/${total}` : '—',
        icon: 'fa-solid fa-circle-check',
        trend: total > 0 ? `${pct}%` : undefined,
        trendVariant: pct === 100 ? 'success' : 'warning',
    }
}

function timeboxInsight(boxes: Timebox[], wake: string, bed: string): Insight {
    const planned = boxes.reduce(
        (sum, b) => sum + (timeToMinutes(b.endTime) - timeToMinutes(b.startTime)),
        0
    )
    const waking = Math.max(0, timeToMinutes(bed) - timeToMinutes(wake))
    const pct = waking > 0 ? Math.round((planned / waking) * 100) : 0
    return {
        label: 'Planned today',
        value: planned > 0 ? formatDuration(planned) : '—',
        icon: 'fa-solid fa-bars-staggered',
        trend: planned > 0 ? `${pct}% of day` : undefined,
        trendVariant: pct > 100 ? 'danger' : 'success',
    }
}

function budgetInsight(
    groups: FinanceGroup[],
    rows: FinanceRow[],
    entries: FinanceEntry[],
    spends: BudgetSpend[],
    excludedDates: Set<string>,
    date: string
): Insight {
    const month = monthOf(date)
    const visibleBudgeted = (type: 'daily' | 'weekly') =>
        rows.filter(
            (r) =>
                r.budgeted &&
                r.budgetType === type &&
                rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
        )

    const weeklyRows = visibleBudgeted('weekly').filter((r) => {
        const entry = entries.find((e) => e.row === r._id)
        return (entry?.amount ?? r.recurringAmount ?? 0) > 0
    })
    const dailyRows = visibleBudgeted('daily').filter((r) => {
        const entry = entries.find((e) => e.row === r._id)
        return (entry?.amount ?? r.recurringAmount ?? 0) > 0
    })

    // Prefer weekly budgets as the primary signal; fall back to daily.
    const isWeekly = weeklyRows.length > 0
    const trackedRows = isWeekly ? weeklyRows : dailyRows

    if (trackedRows.length === 0) {
        return { label: 'Allowance left', value: '—', icon: 'fa-solid fa-wallet' }
    }

    if (isWeekly) {
        // Weekly: show remaining for this week (rate + carry − spent so far).
        // Clamp to the month so the week resets on the 1st, matching the Budgets page.
        const { weekStart: wStart, weekEnd: wEnd } = clampedWeekRange(date)
        const { remaining, carry } = weeklyRows.reduce(
            (acc, row) => {
                const entry = entries.find((e) => e.row === row._id)
                const rowSpends = spends.filter((s) => s.row === row._id)
                const bw = computeBudgetWeek(row, entry, rowSpends, wStart, wEnd, date, excludedDates)
                return { remaining: acc.remaining + bw.remaining, carry: acc.carry + bw.carry }
            },
            { remaining: 0, carry: 0 }
        )
        const roundedCarry = Math.round(carry * 100) / 100
        const s = new Date(`${wStart}T00:00:00`)
        const e = new Date(`${wEnd}T00:00:00`)
        const weekLabel = `${s.getDate()}–${e.getDate()} ${e.toLocaleString('default', { month: 'short' })}`
        const sub =
            roundedCarry > 0
                ? `${money(roundedCarry)} carry · week ${weekLabel}`
                : roundedCarry < 0
                  ? `${money(Math.abs(roundedCarry))} deficit · week ${weekLabel}`
                  : `week ${weekLabel}`
        return {
            label: 'Weekly allowance left',
            value: money(remaining),
            icon: 'fa-solid fa-wallet',
            sub,
            subVariant: remaining >= 0 ? 'success' : 'danger',
        }
    }

    // Daily fallback
    const { remaining, carry } = dailyRows.reduce(
        (acc, row) => {
            const entry = entries.find((e) => e.row === row._id)
            const rowSpends = spends.filter((s) => s.row === row._id)
            const day = computeBudgetDay(row, entry, rowSpends, date, excludedDates)
            return { remaining: acc.remaining + day.remaining, carry: acc.carry + day.carry }
        },
        { remaining: 0, carry: 0 }
    )
    const roundedCarry = Math.round(carry * 100) / 100
    const sub =
        roundedCarry > 0
            ? `${money(roundedCarry)} carried over`
            : roundedCarry < 0
              ? `${money(Math.abs(roundedCarry))} overspent`
              : undefined
    return {
        label: 'Daily allowance left',
        value: money(remaining),
        icon: 'fa-solid fa-wallet',
        sub,
        subVariant: roundedCarry >= 0 ? 'success' : 'danger',
    }
}

// ── Strip ────────────────────────────────────────────────────────────────────

const PLACEHOLDERS: Insight[] = [
    { label: 'Habits today', value: '…', icon: 'fa-solid fa-fire' },
    { label: 'Tasks done', value: '…', icon: 'fa-solid fa-circle-check' },
    { label: 'Planned today', value: '…', icon: 'fa-solid fa-bars-staggered' },
    { label: 'Budget left today', value: '…', icon: 'fa-solid fa-wallet' },
]

/** Raw inputs for the strip; insights are derived from these at render time. */
interface StripData {
    habits: HabitDef[]
    logs: HabitLog[]
    tasks: Task[]
    boxes: Timebox[]
    groups: FinanceGroup[]
    rows: FinanceRow[]
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excludedDates: Set<string>
}

export default function InsightsStrip({ date }: { date: string }) {
    // Subscribe to the hide-money switch. Because the money figures are formatted
    // during render (below) rather than baked into state, this re-render re-masks
    // them the instant the toggle flips — no refetch needed.
    useMoneyHidden()
    const { user } = useAuth()
    // Refetch whenever any of these data topics change elsewhere in the app.
    const dataVersion = useDataVersion('habits', 'tasks', 'timeboxes', 'budget')
    const [data, setData] = useState<StripData | null>(null)
    const [failed, setFailed] = useState(false)
    const [loadedKey, setLoadedKey] = useState<string | null>(null)

    const month = monthOf(date)
    const wake = user?.settings?.wakeTime || DEFAULT_WAKE
    const bed = user?.settings?.bedTime || DEFAULT_BED
    // One key for everything the strip depends on; while it doesn't match the
    // last loaded key we show placeholders rather than stale numbers.
    const key = `${date}|${wake}|${bed}`
    const loading = loadedKey !== key

    useEffect(() => {
        let active = true
        setFailed(false)
        Promise.all([
            listHabits(),
            listLogs(addDays(date, -STREAK_WINDOW), date),
            listTasks(date, date),
            listTimeboxes(date, date),
            listGroups(),
            listRows(),
            listEntries(month),
            listBudgetSpends({ month }),
            listBudgetExclusions(month),
        ])
            .then(([habits, logs, tasks, boxes, groups, rows, entries, spends, exclusions]) => {
                if (!active) return
                setData({
                    habits,
                    logs,
                    tasks,
                    boxes,
                    groups,
                    rows,
                    entries,
                    spends,
                    excludedDates: new Set(exclusions.map((d) => d.date)),
                })
            })
            .catch(() => {
                if (active) {
                    setData(null)
                    setFailed(true)
                }
            })
            .finally(() => {
                if (active) setLoadedKey(key)
            })
        return () => {
            active = false
        }
        // dataVersion forces a silent refetch when a topic changes elsewhere;
        // loadedKey already matches `key`, so the strip updates in place without
        // flashing placeholders.
    }, [key, dataVersion, date, month, wake, bed])

    // Derive the cards on every render so money formatting reflects the hide
    // switch immediately; the raw data is cached in state between fetches.
    const cards: Insight[] =
        loading || !data
            ? failed
                ? PLACEHOLDERS.map((p) => ({ ...p, value: '—' }))
                : PLACEHOLDERS
            : [
                  habitInsight(data.habits, data.logs, date),
                  taskInsight(data.tasks),
                  timeboxInsight(data.boxes, wake, bed),
                  budgetInsight(
                      data.groups,
                      data.rows,
                      data.entries,
                      data.spends,
                      data.excludedDates,
                      date
                  ),
              ]

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {cards.map((c) => (
                <StatCard
                    key={c.label}
                    label={c.label}
                    value={c.value}
                    icon={c.icon}
                    trend={c.trend}
                    trendVariant={c.trendVariant}
                    sub={c.sub}
                    subVariant={c.subVariant}
                />
            ))}
        </div>
    )
}
