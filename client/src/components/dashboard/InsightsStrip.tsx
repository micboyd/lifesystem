import { useEffect, useState } from 'react'
import StatCard from './StatCard'
import { useAuth } from '../../context/AuthContext'
import { listHabits, listLogs } from '../../services/habits'
import { listTasks } from '../../services/tasks'
import { listTimeboxes } from '../../services/timeboxes'
import { listRows, listEntries, listBudgetSpends } from '../../services/finances'
import { computeBudgetDay, monthOf } from '../../lib/budget'
import { addDays } from '../../lib/calendar'
import { timeToMinutes, formatDuration, DEFAULT_WAKE, DEFAULT_BED } from '../../lib/time'
import type { HabitDef, HabitLog, Task, Timebox, FinanceRow, FinanceEntry, BudgetSpend } from '../../types'

/** How far back to look when computing the habit streak. */
const STREAK_WINDOW = 30

interface Insight {
    label: string
    value: string
    icon: string
    trend?: string
    trendVariant?: 'success' | 'warning' | 'danger'
}

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
    rows: FinanceRow[],
    entries: FinanceEntry[],
    spends: BudgetSpend[],
    date: string
): Insight {
    const dailyRows = rows.filter((r) => r.budgeted && r.budgetType === 'daily')
    const withAmounts = dailyRows.filter((r) => {
        const entry = entries.find((e) => e.row === r._id)
        return (entry?.amount ?? r.recurringAmount ?? 0) > 0
    })
    if (withAmounts.length === 0) {
        return { label: 'Budget left today', value: '—', icon: 'fa-solid fa-wallet' }
    }

    const remaining = withAmounts.reduce((sum, row) => {
        const entry = entries.find((e) => e.row === row._id)
        const rowSpends = spends.filter((s) => s.row === row._id)
        return sum + computeBudgetDay(row, entry, rowSpends, date).remaining
    }, 0)

    const over = remaining < 0
    const abs = Math.abs(remaining).toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    return {
        label: over ? 'Over budget today' : 'Budget left today',
        value: `£${abs}`,
        icon: 'fa-solid fa-wallet',
        trend: over ? 'over' : 'on track',
        trendVariant: over ? 'danger' : 'success',
    }
}

// ── Strip ────────────────────────────────────────────────────────────────────

const PLACEHOLDERS: Insight[] = [
    { label: 'Habits today', value: '…', icon: 'fa-solid fa-fire' },
    { label: 'Tasks done', value: '…', icon: 'fa-solid fa-circle-check' },
    { label: 'Planned today', value: '…', icon: 'fa-solid fa-bars-staggered' },
    { label: 'Budget left today', value: '…', icon: 'fa-solid fa-wallet' },
]

export default function InsightsStrip({ date }: { date: string }) {
    const { user } = useAuth()
    const [insights, setInsights] = useState<Insight[]>(PLACEHOLDERS)
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
        Promise.all([
            listHabits(),
            listLogs(addDays(date, -STREAK_WINDOW), date),
            listTasks(date, date),
            listTimeboxes(date, date),
            listRows(),
            listEntries(month),
            listBudgetSpends({ month }),
        ])
            .then(([habits, logs, tasks, boxes, rows, entries, spends]) => {
                if (!active) return
                setInsights([
                    habitInsight(habits, logs, date),
                    taskInsight(tasks),
                    timeboxInsight(boxes, wake, bed),
                    budgetInsight(rows, entries, spends, date),
                ])
            })
            .catch(() => active && setInsights(PLACEHOLDERS.map((p) => ({ ...p, value: '—' }))))
            .finally(() => { if (active) setLoadedKey(key) })
        return () => { active = false }
    }, [key, date, month, wake, bed])

    const cards = loading ? PLACEHOLDERS : insights

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
                />
            ))}
        </div>
    )
}
