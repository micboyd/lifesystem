import { useEffect, useState } from 'react'
import DashSection, { DASH, SectionLoading } from './DashSection'
import { listBirthdays } from '../../services/birthdays'
import { daysBetween } from '../../lib/daysSince'
import type { Birthday } from '../../types'

/** Birthdays this many days out count as "coming up". */
const WINDOW_DAYS = 10
/** How many the dashboard shows; the rest are a tap away. */
const SHOW = 4

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Days from `today` ("YYYY-MM-DD") to the next `mmdd` birthday, 0 when it's today. */
function daysToNext(mmdd: string, today: string): number {
    const year = Number(today.slice(0, 4))
    const thisYear = daysBetween(today, `${year}-${mmdd}`)
    return thisYear >= 0 ? thisYear : daysBetween(today, `${year + 1}-${mmdd}`)
}

function formatDay(mmdd: string): string {
    const [mm, dd] = mmdd.split('-').map(Number)
    return `${dd} ${MONTHS[mm - 1]}`
}

function countLabel(days: number): string {
    if (days === 0) return 'Today'
    if (days === 1) return 'Tomorrow'
    return `${days}d`
}

/** The birthdays coming up in the next few days, soonest first. */
export default function BirthdaysWidget({ date }: { date: string }) {
    const [birthdays, setBirthdays] = useState<Birthday[] | null>(null)

    useEffect(() => {
        listBirthdays()
            .then(setBirthdays)
            .catch(() => setBirthdays([]))
    }, [])

    const sorted = (birthdays ?? [])
        .map((b) => ({ birthday: b, days: daysToNext(b.date, date) }))
        .sort((a, b) => a.days - b.days)
    const soon = sorted.filter(({ days }) => days <= WINDOW_DAYS)
    const shown = soon.slice(0, SHOW)
    const todayCount = sorted.filter(({ days }) => days === 0).length

    return (
        <DashSection
            title="Birthdays"
            icon="fa-solid fa-cake-candles"
            tone="coral"
            meta={
                todayCount > 0
                    ? `${todayCount} today`
                    : soon.length > 0
                      ? `${soon.length} in the next ${WINDOW_DAYS} days`
                      : undefined
            }
            to="/birthdays"
            action="All"
        >
            {birthdays === null ? (
                <SectionLoading rows={2} />
            ) : shown.length === 0 ? (
                <p className={DASH.empty}>No birthdays in the next {WINDOW_DAYS} days.</p>
            ) : (
                <ul className={DASH.list}>
                    {shown.map(({ birthday, days }) => (
                        <li key={birthday._id} className={DASH.row}>
                            <span
                                className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-sm ${
                                    days === 0 ? 'bg-coral-50 text-coral-600' : 'bg-neutral-100 text-neutral-500'
                                }`}
                            >
                                <i className="fa-solid fa-cake-candles" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] text-neutral-900">{birthday.name}</p>
                                <p className={DASH.note}>{formatDay(birthday.date)}</p>
                            </div>
                            <span className={days === 0 ? DASH.rowFigure.replace('text-neutral-900', 'text-coral-600') : DASH.rowFigure}>
                                {countLabel(days)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </DashSection>
    )
}
