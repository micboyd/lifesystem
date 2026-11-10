import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH, SectionLoading } from './DashSection'
import { listDaysUntil } from '../../services/daysUntil'
import { listDaysSince } from '../../services/daysSince'
import { daysUntil } from '../../lib/daysUntil'
import { daysBetween, isMilestoneDay, milestoneLabel } from '../../lib/daysSince'
import { todayKey } from '../../lib/calendar'
import {
    DAYS_SINCE_COLOR_CLASSES,
    DAYS_UNTIL_COLOR_CLASSES,
    type DaysSinceItem,
    type DaysUntilItem,
} from '../../types'

/** How many of each list the dashboard shows; the rest are a tap away. */
const SHOW = 3

/** One counter: its icon, its name, and the number that matters. */
function Row({
    icon,
    tile,
    accent,
    label,
    note,
    value,
}: {
    icon: string
    tile: string
    accent: string
    label: string
    note?: string
    value: string
}) {
    return (
        <li className={DASH.row}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-sm ${tile} ${accent}`}>
                <i className={icon} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-neutral-900">{label}</p>
                {note && <p className={DASH.note}>{note}</p>}
            </div>
            <span className={DASH.rowFigure}>
                {value}
            </span>
        </li>
    )
}

function Group({ title, to, bare, children }: { title: string; to: string; bare?: boolean; children: ReactNode }) {
    if (bare) return <ul className={DASH.list}>{children}</ul>
    return (
        <section>
            <div className="mb-2 flex items-center justify-between">
                <p className={DASH.subhead}>{title}</p>
                <Link to={to} className="text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900">
                    All
                </Link>
            </div>
            <ul className={DASH.list}>{children}</ul>
        </section>
    )
}

/** "Sat 28 November" for a "YYYY-MM-DD" key. */
function dayLabel(key: string): string {
    const d = new Date(`${key.slice(0, 10)}T00:00:00`)
    if (Number.isNaN(d.getTime())) return ''
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
    const month = d.toLocaleDateString('en-GB', { month: 'long' })
    return `${weekday} ${d.getDate()} ${month}`
}

/**
 * Days until the things coming up, and days since the things being kept up.
 * `show` splits them into two sections (Home gives each its own card); by
 * default both sit in one.
 */
export default function CountdownsWidget({ show = 'both' }: { show?: 'both' | 'until' | 'since' } = {}) {
    const [until, setUntil] = useState<DaysUntilItem[] | null>(null)
    const [since, setSince] = useState<DaysSinceItem[] | null>(null)
    const today = todayKey()

    // Only fetch the list(s) this section shows.
    useEffect(() => {
        if (show !== 'since')
            listDaysUntil()
                .then(setUntil)
                .catch(() => setUntil([]))
        if (show !== 'until')
            listDaysSince()
                .then(setSince)
                .catch(() => setSince([]))
    }, [show])

    const upcoming = (show === 'since' ? [] : (until ?? []))
        .map((item) => ({ item, days: daysUntil(item.targetDate, today) }))
        .filter(({ days }) => days >= 0)
        .sort((a, b) => a.days - b.days)
        .slice(0, SHOW)
    const running = (show === 'until' ? [] : (since ?? []))
        .map((item) => ({ item, days: daysBetween(item.startDate, today) }))
        .sort((a, b) => b.days - a.days)
        .slice(0, SHOW)

    const loading = (show !== 'since' && until === null) || (show !== 'until' && since === null)
    const empty = !loading && upcoming.length === 0 && running.length === 0

    return (
        <DashSection
            title={show === 'until' ? 'Coming up' : show === 'since' ? 'Days since' : 'Countdowns'}
            icon={show === 'since' ? 'fa-solid fa-rotate-left' : 'fa-solid fa-hourglass-half'}
            tone={show === 'since' ? 'teal' : 'amber'}
            to={show === 'until' ? '/days-until' : show === 'since' ? '/days-since' : undefined}
            action={show === 'both' ? undefined : 'All'}
        >
            {loading ? (
                <SectionLoading />
            ) : empty ? (
                <p className={DASH.empty}>
                    Nothing counting.{' '}
                    <Link to={show === 'since' ? '/days-since' : '/days-until'} className={DASH.emptyLink}>
                        {show === 'since' ? 'Start a counter' : 'Add a countdown'}
                    </Link>
                </p>
            ) : (
                <div className={DASH.stack}>
                    {upcoming.length > 0 && (
                        <Group title="Coming up" to="/days-until" bare={show !== 'both'}>
                            {upcoming.map(({ item, days }) => {
                                const c = DAYS_UNTIL_COLOR_CLASSES[item.color]
                                return (
                                    <Row
                                        key={item._id}
                                        icon={item.icon}
                                        tile={c.tile}
                                        accent={c.accent}
                                        label={item.label}
                                        note={dayLabel(item.targetDate)}
                                        value={days === 0 ? 'Today' : `${days}d`}
                                    />
                                )
                            })}
                        </Group>
                    )}
                    {running.length > 0 && (
                        <Group title="Days since" to="/days-since" bare={show !== 'both'}>
                            {running.map(({ item, days }) => {
                                const c = DAYS_SINCE_COLOR_CLASSES[item.color]
                                return (
                                    <Row
                                        key={item._id}
                                        icon={item.icon}
                                        tile={c.tile}
                                        accent={c.accent}
                                        label={item.label}
                                        note={
                                            isMilestoneDay(days)
                                                ? `${milestoneLabel(days)} today`
                                                : `Since ${dayLabel(item.startDate).replace(/^\S+ /, '')}`
                                        }
                                        value={`${days}d`}
                                    />
                                )
                            })}
                        </Group>
                    )}
                </div>
            )}
        </DashSection>
    )
}
