import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listBirthdays } from '../../services/birthdays'
import type { Birthday } from '../../types'

const WINDOW_DAYS = 7

interface UpcomingBirthday {
    birthday: Birthday
    date: string   // YYYY-MM-DD of next occurrence
    daysUntil: number
}

function nextOccurrence(mmdd: string, today: string): { date: string; daysUntil: number } {
    const [ty, tm, td] = today.split('-').map(Number)
    const [bm, bd] = mmdd.split('-').map(Number)

    const thisYear = new Date(ty, bm - 1, bd)
    const todayDate = new Date(ty, tm - 1, td)

    let target = thisYear
    if (thisYear < todayDate) {
        target = new Date(ty + 1, bm - 1, bd)
    }

    const daysUntil = Math.round((target.getTime() - todayDate.getTime()) / 86_400_000)
    const yyyy = target.getFullYear()
    const mm = String(target.getMonth() + 1).padStart(2, '0')
    const dd = String(target.getDate()).padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, daysUntil }
}

function formatDate(mmdd: string): string {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const [mm, dd] = mmdd.split('-').map(Number)
    return `${dd} ${months[mm - 1]}`
}

export default function BirthdayWidget({ date }: { date: string }) {
    const [upcoming, setUpcoming] = useState<UpcomingBirthday[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        listBirthdays()
            .then((birthdays) => {
                const results: UpcomingBirthday[] = birthdays
                    .map((b) => ({ birthday: b, ...nextOccurrence(b.date, date) }))
                    .filter((b) => b.daysUntil <= WINDOW_DAYS)
                    .sort((a, b) => a.daysUntil - b.daysUntil)
                setUpcoming(results)
            })
            .finally(() => setLoading(false))
    }, [date])

    if (!loading && upcoming.length === 0) return null

    return (
        <div className="mt-6">
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Upcoming birthdays</CardTitle>
                <Link
                    to="/birthdays"
                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Manage
                </Link>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : (
                <ul className="divide-y divide-neutral-100">
                    {upcoming.map(({ birthday, daysUntil }) => (
                        <li key={birthday._id} className="flex items-center gap-4 py-3">
                            <span
                                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm ${
                                    daysUntil === 0
                                        ? 'bg-pink-100 text-pink-600'
                                        : 'bg-neutral-100 text-neutral-400'
                                }`}
                            >
                                <i className="fa-solid fa-cake-candles" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-neutral-900">
                                    {birthday.name}
                                </p>
                                <p className="text-xs text-neutral-400">{formatDate(birthday.date)}</p>
                            </div>
                            <span
                                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                                    daysUntil === 0
                                        ? 'bg-pink-100 text-pink-600'
                                        : daysUntil <= 2
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-neutral-100 text-neutral-500'
                                }`}
                            >
                                {daysUntil === 0 ? 'Today!' : `${daysUntil}d`}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
        </div>
    )
}
