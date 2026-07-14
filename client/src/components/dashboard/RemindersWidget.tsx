import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listReminders } from '../../services/reminders'
import { useDataVersion } from '../../context/DataSyncContext'
import { MONTHS, WEEKDAYS_LONG, addDays, parseDateKey } from '../../lib/calendar'
import type { Reminder } from '../../types'

const WINDOW_DAYS = 7

function daysBetween(from: string, to: string): number {
    const a = parseDateKey(from)
    const b = parseDateKey(to)
    return Math.round(
        (Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86_400_000
    )
}

/** Short label like "Tue 3 Jul". */
function shortDate(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()].slice(0, 3)
    return `${weekday} ${day} ${MONTHS[month].slice(0, 3)}`
}

function counterLabel(daysUntil: number): string {
    if (daysUntil <= 0) return 'Today'
    if (daysUntil === 1) return 'Tomorrow'
    return `${daysUntil}d`
}

/**
 * Dashboard widget listing reminders due within the next 7 days, each tagged with
 * a day counter. Renders nothing when there are no upcoming reminders.
 */
export default function RemindersWidget({ date }: { date: string }) {
    const [reminders, setReminders] = useState<Reminder[]>([])
    const [loading, setLoading] = useState(true)
    const version = useDataVersion('reminders')

    useEffect(() => {
        let active = true
        const to = addDays(date, WINDOW_DAYS)
        listReminders(date, to)
            .then((list) => active && setReminders(list))
            .catch(() => active && setReminders([]))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [date, version])

    if (!loading && reminders.length === 0) return null

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Reminders</CardTitle>
                <CardAction to="/calendar">Calendar</CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : (
                <ul className="divide-y divide-neutral-100">
                    {reminders.map((reminder) => {
                        const daysUntil = daysBetween(date, reminder.date)
                        const isToday = daysUntil <= 0
                        return (
                            <li
                                key={`${reminder._id}-${reminder.date}`}
                                className="flex items-center gap-4 py-3"
                            >
                                <span
                                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm ${
                                        isToday
                                            ? 'bg-amber-100 text-amber-600'
                                            : 'bg-neutral-100 text-neutral-400'
                                    }`}
                                >
                                    <i className="fa-solid fa-bell" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
                                        <span className="truncate">{reminder.text}</span>
                                        {reminder.recurrence && (
                                            <i
                                                className="fa-solid fa-repeat shrink-0 text-[10px] text-neutral-300"
                                                title="Repeats"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </p>
                                    <p className="text-xs text-neutral-400">
                                        {shortDate(reminder.date)}
                                    </p>
                                </div>
                                <Link
                                    to={`/day/${reminder.date}`}
                                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                                        isToday
                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                            : daysUntil <= 2
                                              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                    }`}
                                >
                                    {counterLabel(daysUntil)}
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Card>
    )
}
