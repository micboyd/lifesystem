import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Spinner from '../Spinner'
import { listHabits, listLogs, checkHabit, uncheckHabit } from '../../services/habits'
import { useInvalidate, useDataVersion } from '../../context/DataSyncContext'
import { addDays, todayKey } from '../../lib/calendar'
import { iconForHabit } from '../../lib/habitIcons'
import type { HabitDef, HabitLog } from '../../types'

/** How far back we pull logs to compute each habit's current streak. */
const WINDOW_DAYS = 120

/**
 * Consecutive completed days ending at `date`. An as-yet-unlogged `date` doesn't
 * break the run — the streak then counts back from the day before — so a fresh
 * morning still shows yesterday's momentum.
 */
function streakEndingAt(done: Set<string>, date: string): number {
    let cursor = done.has(date) ? date : addDays(date, -1)
    let streak = 0
    while (done.has(cursor)) {
        streak++
        cursor = addDays(cursor, -1)
    }
    return streak
}

export default function HabitTiles({ date = todayKey() }: { date?: string }) {
    const invalidate = useInvalidate()
    const habitsVersion = useDataVersion('habits')
    const [habits, setHabits] = useState<HabitDef[]>([])
    const [logs, setLogs] = useState<HabitLog[]>([])
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const loading = loadedKey !== `${date}:${habitsVersion}`
    const [toggling, setToggling] = useState<Set<string>>(new Set())

    useEffect(() => {
        let active = true
        Promise.all([listHabits(), listLogs(addDays(date, -WINDOW_DAYS), date)])
            .then(([defs, windowLogs]) => {
                if (!active) return
                setHabits(defs.filter((h) => h.active))
                setLogs(windowLogs)
            })
            .catch(() => {
                if (active) {
                    setHabits([])
                    setLogs([])
                }
            })
            .finally(() => {
                if (active) setLoadedKey(`${date}:${habitsVersion}`)
            })
        return () => {
            active = false
        }
    }, [date, habitsVersion])

    // Completed dates per habit, for streaks and today's state.
    function doneDates(habitId: string): Set<string> {
        return new Set(logs.filter((l) => l.habit === habitId && l.completed).map((l) => l.date))
    }

    async function toggle(habit: HabitDef) {
        if (toggling.has(habit._id)) return
        setToggling((s) => new Set(s).add(habit._id))
        const isDone = logs.some((l) => l.habit === habit._id && l.date === date && l.completed)
        try {
            if (isDone) {
                await uncheckHabit(habit._id, date)
                setLogs((prev) => prev.filter((l) => !(l.habit === habit._id && l.date === date)))
            } else {
                const log = await checkHabit(habit._id, date)
                setLogs((prev) => [...prev.filter((l) => !(l.habit === habit._id && l.date === date)), log])
            }
            invalidate('habits')
        } finally {
            setToggling((s) => {
                const n = new Set(s)
                n.delete(habit._id)
                return n
            })
        }
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-8">
                <Spinner />
            </div>
        )
    }

    if (habits.length === 0) {
        return (
            <p className="py-4 text-sm text-neutral-400">
                No habits yet.{' '}
                <Link to="/habits" className="font-semibold text-neutral-600 underline underline-offset-2">
                    Add some
                </Link>
                .
            </p>
        )
    }

    const done = habits.filter((h) => doneDates(h._id).has(date)).length
    const total = habits.length
    const allDone = done === total

    return (
        <div className="flex flex-col gap-3">
            {/* Progress header */}
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-neutral-500">
                    {allDone ? 'All done today 🎉' : `${done}/${total} today`}
                </span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100">
                    <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
                    />
                </div>
            </div>

            {/* Tiles */}
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(5.25rem,1fr))]">
                {habits.map((habit) => {
                    const dates = doneDates(habit._id)
                    const completed = dates.has(date)
                    const streak = streakEndingAt(dates, date)
                    const busy = toggling.has(habit._id)
                    return (
                        <button
                            key={habit._id}
                            type="button"
                            onClick={() => toggle(habit)}
                            disabled={busy}
                            title={habit.description || habit.name}
                            aria-pressed={completed}
                            className={[
                                'group relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center transition-all duration-150',
                                completed
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'bg-neutral-50 text-neutral-500 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-100 hover:ring-neutral-300',
                                busy ? 'opacity-60' : '',
                            ].join(' ')}
                        >
                            {/* Streak flame */}
                            {streak > 0 && (
                                <span
                                    className={[
                                        'absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                                        completed ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600',
                                    ].join(' ')}
                                >
                                    <i className="fa-solid fa-fire text-[9px]" aria-hidden="true" />
                                    {streak}
                                </span>
                            )}

                            {/* Done check */}
                            {completed && (
                                <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-white/25 text-[8px]">
                                    <i className="fa-solid fa-check" aria-hidden="true" />
                                </span>
                            )}

                            <i
                                className={[
                                    iconForHabit(habit.name, habit.icon),
                                    'text-xl transition-transform group-hover:scale-110',
                                    completed ? 'text-white' : 'text-neutral-400',
                                ].join(' ')}
                                aria-hidden="true"
                            />
                            <span
                                className={[
                                    'line-clamp-2 text-[11px] font-semibold leading-tight',
                                    completed ? 'text-white' : 'text-neutral-700',
                                ].join(' ')}
                            >
                                {habit.name}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
