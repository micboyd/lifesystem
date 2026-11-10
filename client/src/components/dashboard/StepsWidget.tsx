import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH, SectionLoading } from './DashSection'
import { useSteps } from './useSteps'
import { useWalks } from '../walking/useWalks'
import { useAuth } from '../../context/AuthContext'
import { todayKey } from '../../lib/calendar'
import { stepsSummary, type StepsWeekDay } from '../../lib/steps'
import { nextWalk, walkDayTotals } from '../../lib/walking'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmt = (n: number) => n.toLocaleString('en-GB')
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

/** Steps from Garmin: today against the target, how the last week went, and today's walks. */
export default function StepsWidget() {
    const { user } = useAuth()
    const target = user?.settings?.stepGoal
    const today = todayKey()
    const { days, status, settled } = useSteps(today)
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

                    <div className={`${DASH.block} grid grid-cols-7`}>
                        {s.week.map((d) => (
                            <WeekDay key={d.date} day={d} />
                        ))}
                    </div>

                    <ul className={`${DASH.block} ${DASH.list}`}>
                        <li className={DASH.row}>
                            <p className={DASH.rowText}>
                                Daily average
                                {s.counted > 0 && s.counted < 7 && (
                                    <span className={`ml-1.5 ${DASH.note}`}>
                                        {s.counted} day{s.counted === 1 ? '' : 's'}
                                    </span>
                                )}
                            </p>
                            <span className={DASH.rowFigure}>
                                {s.average === null ? '—' : fmt(s.average)}
                            </span>
                        </li>
                        <li className={DASH.row}>
                            {target ? (
                                <>
                                    <p className={DASH.rowText}>Target hit</p>
                                    <span className={DASH.rowFigure}>
                                        {s.counted > 0 ? `${s.hit} of ${s.counted} days` : '—'}
                                    </span>
                                </>
                            ) : (
                                <Link
                                    to="/profile#steps"
                                    className={`text-[15px] ${DASH.emptyLink}`}
                                >
                                    Set a daily target
                                </Link>
                            )}
                        </li>
                        {!!target && (
                            <li className={DASH.row}>
                                <p className={DASH.rowText}>Target streak</p>
                                <span className={DASH.rowFigure}>
                                    {s.streak} day{s.streak === 1 ? '' : 's'}
                                </span>
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

/** One finished day: the number itself, with a tick when it reached the target. */
function WeekDay({ day }: { day: StepsWeekDay }) {
    const name = weekday(day.date)
    return (
        <div
            className="flex flex-col items-center gap-1.5"
            title={
                day.steps === null
                    ? `${name}: no data`
                    : `${name}: ${fmt(day.steps)} steps${day.hit ? ', target hit' : ''}`
            }
        >
            <span className={DASH.note}>{name}</span>
            <span
                className={`text-[13px] nums ${day.steps === null ? 'text-neutral-400' : 'text-neutral-900'}`}
            >
                {day.steps === null ? '—' : short(day.steps)}
            </span>
            <span className="h-3 text-[11px] leading-3 text-success">
                {day.hit && <i className="fa-solid fa-check" aria-hidden="true" />}
            </span>
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
