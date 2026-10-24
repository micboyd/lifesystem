import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listHabits, listLogs } from '../../services/habits'
import { useDataVersion } from '../../context/DataSyncContext'
import { formatAmount } from '../../lib/money'
import { useMoneyHidden } from '../useMoneyHidden'
import type { BudgetToday } from './useBudgetToday'
import type { NutritionToday } from './NutritionWidget'
import type { Event } from '../../types'
import { AREA_TONES, AreaIcon, type AreaTone } from './DashSection'

interface TileProps {
    to: string
    icon: string
    /** The area's colour, shared with its section below. */
    area: AreaTone
    label: string
    value: string
    sub: string
    /** 0–100, or null for no bar. */
    bar?: number | null
    tone?: 'neutral' | 'good' | 'bad'
    loading?: boolean
}

const TONE: Record<NonNullable<TileProps['tone']>, string> = {
    neutral: 'text-neutral-950',
    good: 'text-success',
    bad: 'text-danger',
}

/**
 * One headline figure on the band: a quiet label, a large mono number and a
 * hairline of progress. No box; the band's dividers separate the four.
 */
function Tile({ to, icon, area, label, value, sub, bar = null, tone = 'neutral', loading = false }: TileProps) {
    return (
        <Link
            to={to}
            className="group flex min-w-0 flex-col p-5 transition-colors hover:bg-neutral-50/70 sm:p-7"
        >
            <span className="flex items-center gap-2.5 text-[13px] text-neutral-600 transition-colors group-hover:text-neutral-900">
                <AreaIcon icon={icon} tone={area} size="sm" />
                {label}
                <i
                    className="fa-solid fa-arrow-right ml-auto text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                />
            </span>
            {loading ? (
                <span className="mt-4 h-10 w-24 animate-pulse rounded-lg bg-neutral-100" />
            ) : (
                <span
                    className={`mt-4 truncate text-[32px] font-medium leading-[1.15] tracking-[-0.04em] tabular-nums sm:text-[40px] ${TONE[tone]}`}
                >
                    {value}
                </span>
            )}
            <span className="mt-1 truncate text-[13px] text-neutral-500">{loading ? '\u00a0' : sub}</span>
            <span className="mt-4 block h-1 w-full overflow-hidden rounded-full bg-neutral-100">
                {bar !== null && !loading && (
                    <span
                        className={`block h-full rounded-full ${tone === 'bad' ? 'bg-danger' : AREA_TONES[area].bar}`}
                        style={{ width: `${Math.min(100, Math.max(0, bar))}%` }}
                    />
                )}
            </span>
        </Link>
    )
}

/** Today's habits ticked, kept in step with ticks made anywhere on the page. */
function useHabitsDone(date: string) {
    const version = useDataVersion('habits')
    const [state, setState] = useState<{ key: string; done: number; total: number } | null>(null)
    const key = `${date}:${version}`

    useEffect(() => {
        let active = true
        Promise.all([listHabits(), listLogs(date, date)])
            .then(([habits, logs]) => {
                if (!active) return
                const live = habits.filter((h) => h.active)
                const ticked = new Set(logs.filter((l) => l.completed).map((l) => l.habit))
                setState({ key, done: live.filter((h) => ticked.has(h._id)).length, total: live.length })
            })
            .catch(() => active && setState({ key, done: 0, total: 0 }))
        return () => {
            active = false
        }
    }, [date, key])

    return { loading: state === null, done: state?.done ?? 0, total: state?.total ?? 0 }
}

/**
 * The four numbers that say how today is going, above everything else. Each one
 * is the headline of a card or page below it, one tap away.
 */
export default function AtAGlance({
    date,
    nutrition,
    budget,
    events,
    eventsLoading,
}: {
    date: string
    nutrition: NutritionToday
    budget: BudgetToday
    events: Event[]
    eventsLoading: boolean
}) {
    useMoneyHidden() // re-render when money is hidden/shown
    const habits = useHabitsDone(date)

    const kcal = Math.round(nutrition.eaten.calories)
    const kcalGoal = nutrition.goals?.calories ?? null

    const { safe, allowance, spent } = budget.summary.today
    const hasBudgets = budget.summary.hasBudgets

    return (
        // One white band holding the four figures: 2×2 on phones, a row of four
        // from lg, ruled between. The page's only full-width surface.
        <div className="grid grid-cols-2 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-neutral-900/[0.06] lg:grid-cols-4 lg:divide-x lg:divide-neutral-100 max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r max-lg:[&>*]:border-neutral-100">
            <Tile
                to="/goals"
                icon="fa-solid fa-repeat"
                area="green"
                label="Habits"
                loading={habits.loading}
                value={habits.total ? `${habits.done}/${habits.total}` : '–'}
                sub={
                    !habits.total
                        ? 'None set up'
                        : habits.done === habits.total
                          ? 'All done today'
                          : `${habits.total - habits.done} to go`
                }
                bar={habits.total ? (habits.done / habits.total) * 100 : null}
                tone={habits.total > 0 && habits.done === habits.total ? 'good' : 'neutral'}
            />
            <Tile
                to="/nutrition"
                icon="fa-solid fa-bowl-food"
                area="amber"
                label="Calories"
                loading={nutrition.loading}
                value={kcal.toLocaleString()}
                sub={kcalGoal ? `of ${Math.round(kcalGoal).toLocaleString()} kcal` : 'kcal eaten'}
                bar={kcalGoal ? (kcal / kcalGoal) * 100 : null}
                tone={kcalGoal && kcal > kcalGoal ? 'bad' : 'neutral'}
            />
            <Tile
                to="/finances/budgets"
                icon="fa-solid fa-wallet"
                area="navy"
                label="Safe to spend"
                loading={budget.loading}
                value={!hasBudgets ? '–' : budget.dayOff ? 'Day off' : `£${formatAmount(Math.abs(safe))}`}
                sub={
                    !hasBudgets
                        ? 'No budgets tracked'
                        : budget.dayOff
                          ? 'No budget today'
                          : safe < 0
                            ? 'Over today'
                            : `of £${formatAmount(allowance)} today`
                }
                bar={hasBudgets && !budget.dayOff ? (spent / (allowance || 1)) * 100 : null}
                tone={hasBudgets && !budget.dayOff && safe < 0 ? 'bad' : 'neutral'}
            />
            <Tile
                to={`/calendar?date=${date}`}
                icon="fa-regular fa-calendar"
                area="violet"
                label="Events"
                loading={eventsLoading}
                value={String(events.length)}
                sub={events.length ? events.map((e) => e.title).join(', ') : 'A clear day'}
            />
        </div>
    )
}
