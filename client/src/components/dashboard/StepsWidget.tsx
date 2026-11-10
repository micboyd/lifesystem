import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH, SectionLoading } from './DashSection'
import { useSteps, type StepsData } from './useSteps'
import { useWalks } from '../walking/useWalks'
import { useAuth } from '../../context/AuthContext'
import { todayKey } from '../../lib/calendar'
import { stepsSummary, type StepsWeekDay } from '../../lib/steps'
import { nextWalk, walkDayTotals } from '../../lib/walking'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmt = (n: number) => n.toLocaleString('en-GB')
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

/**
 * Steps from Garmin: today against the target, the last week as bars against
 * a target line, the week's figures, and today's walks. Pass `data` when the
 * page already reads steps (Home does, for its summary strip), so Garmin is
 * asked once.
 */
export default function StepsWidget({ data }: { data?: StepsData } = {}) {
    const { user } = useAuth()
    const target = user?.settings?.stepGoal
    const today = todayKey()
    const own = useSteps(today, !data)
    const { days, status, settled } = data ?? own
    const s = useMemo(
        () => (days ? stepsSummary(days, today, target) : null),
        [days, today, target]
    )

    const hasData = s !== null && (s.today !== null || s.counted > 0)
    const disconnected = status === 'not_connected' || status === 'pending_mfa'
    const walksRow = <WalksToday today={today} />

    return (
        <DashSection
            title="Steps"
            icon="fa-solid fa-shoe-prints"
            tone="green"
            meta={
                <Link
                    to="/profile#steps"
                    className="hover:text-neutral-900 hover:underline hover:underline-offset-4"
                >
                    {target ? `Target ${fmt(target)} a day` : 'Set a daily target'}
                </Link>
            }
            to="/walking"
            action="Walking"
        >
            {!s || (!hasData && !settled) ? (
                <SectionLoading />
            ) : !hasData ? (
                <>
                    <p className={DASH.empty}>
                        {disconnected || status === 'expired' ? (
                            <Link to="/profile#garmin" className={DASH.emptyLink}>
                                {status === 'expired' ? 'Reconnect Garmin' : 'Connect Garmin'}
                            </Link>
                        ) : (
                            'No steps from Garmin yet.'
                        )}
                    </p>
                    <ul className={`${DASH.block} ${DASH.list}`}>{walksRow}</ul>
                </>
            ) : (
                <>
                    <Today steps={s.today} target={target} />

                    <WeekBars week={s.week} today={s.today} target={target} />

                    <dl className={`${DASH.block} grid grid-cols-3 gap-3 rounded-2xl bg-neutral-50 p-4`}>
                        <Stat
                            label="Average"
                            value={s.average === null ? '—' : fmt(s.average)}
                            note={s.counted > 0 && s.counted < 7 ? `${s.counted} day${s.counted === 1 ? '' : 's'}` : undefined}
                        />
                        <Stat label="Target hit" value={target && s.counted > 0 ? `${s.hit} / ${s.counted}` : '—'} />
                        <Stat label="Streak" value={target ? `${s.streak} day${s.streak === 1 ? '' : 's'}` : '—'} />
                    </dl>

                    <ul className={`mt-3 ${DASH.list} border-t-0`}>
                        {!target && (
                            <li className={DASH.row}>
                                <Link to="/profile#steps" className={`text-[15px] ${DASH.emptyLink}`}>
                                    Set a daily target
                                </Link>
                            </li>
                        )}
                        {walksRow}
                    </ul>

                    {status === 'expired' && (
                        <p className={`mt-3 ${DASH.note}`}>
                            Garmin needs reconnecting, so these may be out of date.{' '}
                            <Link to="/profile#garmin" className={DASH.emptyLink}>
                                Reconnect
                            </Link>
                        </p>
                    )}
                </>
            )}
        </DashSection>
    )
}

function Today({ steps, target }: { steps: number | null; target?: number }) {
    const reached = steps !== null && target !== undefined && steps >= target
    return (
        <>
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className={DASH.subhead}>Today</p>
                    <p className={`mt-1 ${DASH.figure}`}>{steps === null ? '—' : fmt(steps)}</p>
                </div>
                <p className={`${DASH.note} nums`}>
                    {steps === null ? (
                        'Not synced yet'
                    ) : reached ? (
                        <>
                            <i
                                className="fa-solid fa-check mr-1.5 text-success"
                                aria-hidden="true"
                            />
                            Target hit
                        </>
                    ) : target ? (
                        `${fmt(target - steps)} to go`
                    ) : null}
                </p>
            </div>
            {target !== undefined && (
                <div
                    className={`mt-4 ${DASH.track}`}
                    role="img"
                    aria-label={`${fmt(steps ?? 0)} of ${fmt(target)} steps`}
                >
                    <div
                        className="h-full rounded-full bg-success"
                        style={{ width: `${Math.min(100, ((steps ?? 0) / target) * 100)}%` }}
                    />
                </div>
            )}
        </>
    )
}

/** One figure in the week's summary. */
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="min-w-0">
            <dt className="truncate text-xs text-neutral-500">
                {label}
                {note && <span className="ml-1">· {note}</span>}
            </dt>
            <dd className="mt-0.5 truncate text-[15px] font-medium tabular-nums text-neutral-900">{value}</dd>
        </div>
    )
}

/**
 * The last seven days and today as bars against a dashed target line. Days
 * that hit the target are green and misses stone, today included; a day with no
 * figure from Garmin is a stub.
 */
function WeekBars({ week, today, target }: { week: StepsWeekDay[]; today: number | null; target?: number }) {
    const days = [
        ...week.map((d) => ({ key: d.date, name: weekday(d.date), steps: d.steps, hit: d.hit, isToday: false })),
        { key: 'today', name: 'Today', steps: today, hit: target !== undefined && today !== null && today >= target, isToday: true },
    ]
    const [shown, setShown] = useState<number | null>(null)
    const top = Math.max(target ?? 0, ...days.map((d) => d.steps ?? 0), 1)
    const height = 96
    const px = (n: number) => Math.max(4, Math.round((n / top) * height))
    return (
        <div className={DASH.block}>
            <div className="relative grid grid-cols-8 items-end gap-1.5" style={{ height }}>
                {target !== undefined && (
                    <span
                        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-300"
                        style={{ bottom: px(target) }}
                        aria-hidden="true"
                    />
                )}
                {days.map((d, i) => {
                    const open = shown === i
                    // Keep the end tooltips inside the card.
                    const align =
                        i === 0 ? 'left-0' : i === days.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    return (
                        <button
                            type="button"
                            key={d.key}
                            className="relative flex h-full w-full items-end focus:outline-none"
                            onMouseEnter={() => setShown(i)}
                            onMouseLeave={() => setShown(null)}
                            onFocus={() => setShown(i)}
                            onBlur={() => setShown(null)}
                            onClick={() => setShown(open ? null : i)}
                            aria-label={
                                d.steps === null
                                    ? `${d.name}: no data`
                                    : `${d.name}: ${fmt(d.steps)} steps${d.hit ? ', target hit' : ''}`
                            }
                        >
                            <span
                                className={`relative w-full rounded-md transition-opacity ${
                                    d.steps === null
                                        ? 'bg-neutral-100'
                                        : d.hit
                                          ? 'bg-success'
                                          : 'bg-neutral-300'
                                } ${shown !== null && !open ? 'opacity-50' : ''}`}
                                style={{ height: d.steps === null ? 4 : px(d.steps) }}
                            >
                                {open && (
                                    <span
                                        className={`pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-lg bg-neutral-900 px-2 py-1 text-[12px] font-medium tabular-nums text-white shadow-sm ${align}`}
                                    >
                                        {d.steps === null ? 'No data' : `${fmt(d.steps)} steps`}
                                    </span>
                                )}
                            </span>
                        </button>
                    )
                })}
            </div>
            <div className="mt-2 grid grid-cols-8 gap-1.5" aria-hidden="true">
                {days.map((d) => (
                    <span
                        key={d.key}
                        className={`truncate text-center text-[11px] ${d.isToday ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}
                    >
                        {d.isToday ? 'Today' : d.name}
                    </span>
                ))}
            </div>
            <p className="sr-only">
                {days.map((d) => `${d.name}: ${d.steps === null ? 'no data' : `${fmt(d.steps)} steps`}`).join(', ')}
            </p>
        </div>
    )
}

/** Today's planned walks in one row: what's next, or that they're done. Opens Walking. */
function WalksToday({ today }: { today: string }) {
    const { walks, weightKg } = useWalks(today)
    if (!walks) return null
    const next = nextWalk(walks)
    const totals = walkDayTotals(walks, weightKg)
    const value =
        walks.length === 0
            ? 'Plan one'
            : next
              ? `Next ${next.time} · ${totals.done} of ${totals.count} done`
              : `All ${totals.count} done`
    return (
        <li>
            <Link to={`/walking?date=${today}`} className={`group ${DASH.row}`}>
                <p
                    className={`${DASH.rowText} group-hover:underline group-hover:underline-offset-4`}
                >
                    Walks today
                </p>
                <span className={walks.length === 0 ? DASH.rowValue : DASH.rowFigure}>{value}</span>
            </Link>
        </li>
    )
}

/** Today's steps as one figure and bar, for a summary strip beside protein and calories. */
export function StepsGlance({ data }: { data: StepsData }) {
    const target = useAuth().user?.settings?.stepGoal
    const today = todayKey()
    const steps = data.days?.find((d) => d.date === today)?.steps ?? null
    if (!target) return null
    return (
        <Link to="/walking" className="group block min-w-0 flex-1 sm:w-36 sm:flex-none">
            <p className="text-[12px] text-neutral-500 group-hover:text-neutral-900">Steps</p>
            <p className="nums mt-0.5 truncate text-[15px] font-medium text-neutral-900">
                {steps === null ? '—' : fmt(steps)}
                <span className="font-normal text-neutral-500"> / {fmt(target)}</span>
            </p>
            <div className={`mt-1.5 ${DASH.track}`}>
                <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${Math.min(100, ((steps ?? 0) / target) * 100)}%` }}
                />
            </div>
        </Link>
    )
}
