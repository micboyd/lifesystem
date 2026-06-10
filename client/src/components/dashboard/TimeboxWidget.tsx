import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardFooter } from '../Card'
import Spinner from '../Spinner'
import { listTimeboxes } from '../../services/timeboxes'
import { todayKey } from '../../lib/calendar'
import { timeToMinutes, formatDuration } from '../../lib/time'
import type { Timebox } from '../../types'

export default function TimeboxWidget({ date = todayKey() }: { date?: string }) {
    const [items, setItems] = useState<Timebox[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date

    useEffect(() => {
        let active = true
        listTimeboxes(date, date)
            .then((list) => active && setItems(list))
            .catch(() => active && setItems([]))
            .finally(() => {
                if (active) setLoadedDate(date)
            })
        return () => {
            active = false
        }
    }, [date])

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Timebox</CardTitle>
                <Link
                    to="/timebox"
                    state={{ date }}
                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Plan day
                </Link>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-6">
                    <Spinner />
                </div>
            ) : items.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-400">No blocks planned yet.</p>
            ) : (
                <ul className="flex flex-col">
                    {items.map((item, i) => {
                        const dur = formatDuration(
                            timeToMinutes(item.endTime) - timeToMinutes(item.startTime)
                        )
                        return (
                            <li
                                key={item._id}
                                className={`flex items-center gap-4 py-3 ${i > 0 ? 'border-t border-neutral-100' : ''}`}
                            >
                                <div className="w-16 shrink-0 text-right">
                                    <p className="text-sm font-semibold tabular-nums text-neutral-700">
                                        {item.startTime}
                                    </p>
                                    <p className="text-[11px] font-medium text-neutral-400">
                                        {dur}
                                    </p>
                                </div>
                                <span className="h-8 w-1 shrink-0 rounded-full bg-neutral-800" />
                                <span className="flex-1 truncate text-sm font-medium text-neutral-800">
                                    {item.title}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}

            <CardFooter>
                <Link
                    to="/timebox"
                    state={{ date }}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                    Add a block
                </Link>
            </CardFooter>
        </Card>
    )
}
