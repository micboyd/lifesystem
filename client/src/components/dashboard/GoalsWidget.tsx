import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listGoals } from '../../services/goals'
import type { Goal } from '../../types'

function daysUntil(date: string): number {
    const [y, m, d] = date.split('-').map(Number)
    const target = new Date(y, m - 1, d)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
}

export default function GoalsWidget() {
    const [goals, setGoals] = useState<Goal[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        listGoals()
            .then((all) => setGoals(all.filter((g) => g.status === 'active')))
            .finally(() => setLoading(false))
    }, [])

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <div>
                    <CardTitle>Goals</CardTitle>
                    {!loading && (
                        <p className="mt-0.5 text-sm text-neutral-400">
                            {goals.length} active goal{goals.length !== 1 ? 's' : ''}
                        </p>
                    )}
                </div>
                <CardAction to="/goals" className="mt-1">
                    All goals
                </CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-10">
                    <Spinner />
                </div>
            ) : goals.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    No active goals.{' '}
                    <Link to="/goals" className="font-semibold text-neutral-600 underline underline-offset-2">
                        Add one
                    </Link>
                    .
                </p>
            ) : (
                <ul className="flex flex-col gap-4">
                    {goals.slice(0, 4).map((g) => {
                        const days = g.targetDate ? daysUntil(g.targetDate) : null
                        const milestonesDone = g.milestones.filter((m) => m.completed).length
                        const milestonesTotal = g.milestones.length
                        return (
                            <li key={g._id}>
                                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                                    <span className="text-sm font-semibold text-neutral-900 truncate">
                                        {g.title}
                                    </span>
                                    <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-700">
                                        {g.progress}%
                                    </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                                    <div
                                        className={`h-full rounded-full transition-all ${g.progress === 100 ? 'bg-emerald-500' : 'bg-neutral-900'}`}
                                        style={{ width: `${g.progress}%` }}
                                    />
                                </div>
                                <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
                                    {days !== null && (
                                        <span className={days < 0 ? 'text-red-500' : days <= 7 ? 'text-amber-600' : ''}>
                                            <i className="fa-regular fa-calendar mr-1" aria-hidden="true" />
                                            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
                                        </span>
                                    )}
                                    {milestonesTotal > 0 && (
                                        <span>{milestonesDone}/{milestonesTotal} milestones</span>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

        </Card>
    )
}
