import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH } from './DashSection'
import HabitTiles from '../habits/HabitTiles'
import { listGoals } from '../../services/goals'
import { todayKey } from '../../lib/calendar'
import type { Goal } from '../../types'

/** Days from today to a YYYY-MM-DD date; negative once it has passed. */
function daysUntil(date: string): number {
    const [y, m, d] = date.split('-').map(Number)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.ceil((new Date(y, m - 1, d).getTime() - now.getTime()) / 86_400_000)
}

/** Today's habits, with the nearest active goals beneath them. */
export default function HabitsWidget({ date = todayKey() }: { date?: string }) {
    const [goals, setGoals] = useState<Goal[]>([])

    useEffect(() => {
        listGoals()
            .then((all) => {
                const active = all.filter((g) => g.status === 'active')
                // Dated goals first, soonest deadline first.
                active.sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))
                setGoals(active.slice(0, 2))
            })
            .catch(() => setGoals([]))
    }, [])

    return (
        <DashSection title="Habits &amp; goals" icon="fa-solid fa-bullseye" tone="green" to="/goals" action="All">
            <HabitTiles date={date} />
            {goals.length > 0 && (
                <ul className={`${DASH.block} ${DASH.list}`}>
                    {goals.map((g) => {
                        const days = g.targetDate ? daysUntil(g.targetDate) : null
                        return (
                            <li key={g._id}>
                                <Link to="/goals" className="group block py-3.5">
                                    <div className="mb-2.5 flex items-baseline justify-between gap-3">
                                        <span className="truncate text-[15px] text-neutral-900 group-hover:underline group-hover:underline-offset-4">
                                            {g.title}
                                        </span>
                                        <span className={`flex items-baseline gap-3 ${DASH.rowValue}`}>
                                            {days !== null &&
                                                (days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`)}
                                            <span className="font-medium text-neutral-900">{g.progress}%</span>
                                        </span>
                                    </div>
                                    <div className={DASH.track}>
                                        <div
                                            className={`h-full rounded-full ${g.progress === 100 ? 'bg-success' : 'bg-brand-500'}`}
                                            style={{ width: `${g.progress}%` }}
                                        />
                                    </div>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </DashSection>
    )
}
