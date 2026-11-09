import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH, SectionLoading } from './DashSection'
import { useWalks } from '../walking/useWalks'
import { formatMinutes, formatWalkKm, nextWalk, walkDayTotals, walkEstimate, walkTitle } from '../../lib/walking'

const fmt = (n: number) => n.toLocaleString('en-GB')

/** The day's walks at a glance: the next one, then each walk and what they add up to. */
export default function WalkingWidget({ date }: { date: string }) {
    const { walks, failed, weightKg } = useWalks(date)
    const totals = useMemo(() => (walks ? walkDayTotals(walks, weightKg) : null), [walks, weightKg])
    const next = walks ? nextWalk(walks) : null
    const e = next ? walkEstimate(next, weightKg) : null
    const link = `/walking?date=${date}`

    return (
        <DashSection
            title="Walking"
            icon="fa-solid fa-person-walking"
            tone="sky"
            meta={totals && totals.count > 0 ? `${totals.done} of ${totals.count} done` : 'Plan a route'}
            to={link}
            action="Open"
        >
            {!walks ? (
                <SectionLoading />
            ) : failed ? (
                <p className={DASH.empty}>Couldn’t load your walks.</p>
            ) : walks.length === 0 ? (
                <p className={DASH.empty}>
                    No walk planned.{' '}
                    <Link to={link} className={DASH.emptyLink}>
                        Plan one
                    </Link>
                </p>
            ) : (
                <>
                    <p className={DASH.subhead}>{next ? `Next · ${next.time}` : 'All walked'}</p>
                    <p className={`mt-1 truncate ${DASH.figureSm}`}>{next ? walkTitle(next) : `${formatWalkKm(totals!.distanceM)} today`}</p>
                    {e && (
                        <p className={`mt-1 ${DASH.note} nums`}>
                            {[formatWalkKm(e.distanceM), formatMinutes(e.minutes), e.kcal === null ? null : `${fmt(e.kcal)} kcal`].filter(Boolean).join(' · ')}
                        </p>
                    )}
                    <ul className={`${DASH.block} ${DASH.list}`}>
                        {walks.map((w) => (
                            <li key={w._id} className={DASH.row}>
                                <span className="w-11 shrink-0 text-[13px] nums text-neutral-500">{w.time}</span>
                                <p className={`${DASH.rowText} ${w.doneAt ? 'text-neutral-500' : ''}`}>{walkTitle(w)}</p>
                                {w.doneAt ? (
                                    <i className="fa-solid fa-check text-xs text-success" aria-label="Done" />
                                ) : (
                                    <span className={DASH.rowValue}>{fmt(walkEstimate(w, weightKg)?.steps ?? 0)} steps</span>
                                )}
                            </li>
                        ))}
                        {walks.length > 1 && totals && (
                            <li className={DASH.row}>
                                <p className={DASH.rowText}>Steps planned</p>
                                <span className={DASH.rowFigure}>{fmt(totals.steps)}</span>
                            </li>
                        )}
                    </ul>
                </>
            )}
        </DashSection>
    )
}
