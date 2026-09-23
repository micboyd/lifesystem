import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listDaysUntil } from '../../services/daysUntil'
import { daysUntil } from '../../lib/daysUntil'
import { DAYS_UNTIL_COLOR_CLASSES, type DaysUntilItem } from '../../types'
import { todayKey } from '../../lib/calendar'

export default function DaysUntilWidget() {
    const [items, setItems] = useState<DaysUntilItem[]>([])
    const [loading, setLoading] = useState(true)

    const today = todayKey()

    useEffect(() => {
        listDaysUntil()
            .then(setItems)
            .finally(() => setLoading(false))
    }, [])

    const ranked = items
        .map((item) => ({ item, days: daysUntil(item.targetDate, today) }))
        // Past dates stay on the full page for editing/cleanup, but drop off the dashboard.
        .filter(({ days }) => days >= 0)
        .sort((a, b) => a.days - b.days)

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Days until</CardTitle>
                <CardAction to="/days-until">All counters</CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : ranked.length === 0 ? (
                <Link
                    to="/days-until"
                    className="flex items-center gap-4 rounded-xl border border-dashed border-neutral-200 px-4 py-5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-lg text-neutral-400">
                        <i className="fa-solid fa-hourglass-end" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-900">Start a countdown</p>
                        <p className="text-xs text-neutral-400">
                            Count down to a trip, deadline or event on your calendar
                        </p>
                    </div>
                    <i className="fa-solid fa-plus text-xs text-neutral-300" aria-hidden="true" />
                </Link>
            ) : (
                <ul className="divide-y divide-neutral-100">
                    {ranked.map(({ item, days }) => {
                        const c = DAYS_UNTIL_COLOR_CLASSES[item.color]
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
                                </div>
                                <div className="shrink-0 text-right">
                                    {days === 0 ? (
                                        <span className={`text-sm font-bold ${c.accent}`}>Today!</span>
                                    ) : (
                                        <>
                                            <span className={`text-xl font-extrabold tracking-tight ${c.accent}`}>
                                                {days}
                                            </span>
                                            <span className="ml-1 text-xs font-semibold text-neutral-400">
                                                {days === 1 ? 'day' : 'days'}
                                            </span>
                                        </>
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
