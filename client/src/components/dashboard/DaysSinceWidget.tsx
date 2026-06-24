import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listDaysSince } from '../../services/daysSince'
import { daysBetween, isMilestoneDay, milestoneLabel } from '../../lib/daysSince'
import { DAYS_SINCE_COLOR_CLASSES, type DaysSinceItem } from '../../types'
import { todayKey } from '../../lib/calendar'

export default function DaysSinceWidget() {
    const [items, setItems] = useState<DaysSinceItem[]>([])
    const [loading, setLoading] = useState(true)

    const today = todayKey()

    useEffect(() => {
        listDaysSince()
            .then(setItems)
            .finally(() => setLoading(false))
    }, [])

    const ranked = [...items]
        .map((item) => ({ item, days: daysBetween(item.startDate, today) }))
        .sort((a, b) => b.days - a.days)

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Days since</CardTitle>
                <Link
                    to="/days-since"
                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Manage
                </Link>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : ranked.length === 0 ? (
                <Link
                    to="/days-since"
                    className="flex items-center gap-4 rounded-xl border border-dashed border-neutral-200 px-4 py-5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-lg text-neutral-400">
                        <i className="fa-solid fa-hourglass-half" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-900">Start a counter</p>
                        <p className="text-xs text-neutral-400">
                            Track the days since a milestone, habit or fresh start
                        </p>
                    </div>
                    <i className="fa-solid fa-plus text-xs text-neutral-300" aria-hidden="true" />
                </Link>
            ) : (
                <ul className="divide-y divide-neutral-100">
                    {ranked.map(({ item, days }) => {
                        const c = DAYS_SINCE_COLOR_CLASSES[item.color]
                        return (
                            <li key={item._id} className="flex items-center gap-4 py-3">
                                <span
                                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base ${c.tile} ${c.accent}`}
                                >
                                    <i className={item.icon} aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-neutral-900">
                                        {item.label}
                                    </p>
                                    {isMilestoneDay(days) && (
                                        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                                            <i className="fa-solid fa-trophy" aria-hidden="true" />
                                            {milestoneLabel(days)} today!
                                        </p>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    <span className={`text-xl font-extrabold tracking-tight ${c.accent}`}>
                                        {days}
                                    </span>
                                    <span className="ml-1 text-xs font-semibold text-neutral-400">
                                        {days === 1 ? 'day' : 'days'}
                                    </span>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Card>
    )
}
