import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { AreaIcon, DASH, SectionLoading } from './DashSection'
import { useTimeline } from '../timeline/useTimeline'
import { MILESTONE_STYLE, PHASE_TONES, fmtDate, fmtNum, fromNow } from '../timeline/format'
import { timelineHint } from '../../lib/timelineHint'
import { daysBetween } from '../../lib/weightTrend'

/** Past this many weeks the bar is one track; segments would be slivers. */
const MAX_SEGMENTS = 40

/**
 * A hint of where you are on the Timeline: the week, how far through, a nudge
 * that fits the stage, and the next change the projection expects you to
 * notice. The full picture is on /timeline.
 */
export default function TimelineWidget() {
    const { today, data, error, gaps, timeline } = useTimeline()
    const hint = useMemo(() => (timeline ? timelineHint(timeline, today) : null), [timeline, today])

    const phase = hint?.phase ? PHASE_TONES[hint.phase.kind].label : null
    const meta = timeline ? `${phase ? `${phase} · ` : ''}to ${fmtDate(timeline.end, true)}` : undefined

    return (
        <DashSection title="Timeline" icon="fa-solid fa-route" tone="coral" meta={meta} to="/timeline" action="Timeline">
            {error ? (
                <p className={DASH.empty}>Couldn’t load the timeline just now.</p>
            ) : !data ? (
                <SectionLoading />
            ) : !hint ? (
                <p className={DASH.empty}>
                    {gaps.length > 0 ? 'No timeline running.' : 'Your plans are in place.'}{' '}
                    <Link to="/timeline" className={DASH.emptyLink}>
                        {gaps.length > 0 ? 'Set one up' : 'Take the quiz'}
                    </Link>
                </p>
            ) : (
                <>
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <p className={DASH.subhead}>Week</p>
                            <p className={`mt-1 ${DASH.figureSm}`}>
                                {hint.week}
                                <span className="ml-1.5 text-sm tracking-normal text-neutral-500">of {hint.total}</span>
                            </p>
                        </div>
                        <p className={`${DASH.note} tabular-nums`}>
                            {hint.weeksLeft === 0
                                ? 'Last week'
                                : `${hint.weeksLeft} week${hint.weeksLeft === 1 ? '' : 's'} to go`}
                        </p>
                    </div>
                    <WeekBar week={hint.week} total={hint.total} progress={hint.progress} />

                    <div className={DASH.block}>
                        <p className="text-[15px] font-semibold text-neutral-900">{hint.headline}</p>
                        <p className="mt-1 text-[14px] leading-6 text-neutral-600">{hint.message}</p>
                    </div>

                    {(hint.next || hint.soFar !== null) && (
                        <ul className={`${DASH.block} ${DASH.list}`}>
                            {hint.soFar !== null && (
                                <li className={DASH.row}>
                                    <AreaIcon
                                        icon={hint.soFar < 0 ? 'fa-solid fa-arrow-trend-down' : 'fa-solid fa-arrow-trend-up'}
                                        tone="green"
                                        size="sm"
                                    />
                                    <p className={DASH.rowText}>
                                        {fmtNum(Math.abs(hint.soFar), 1)} kg {hint.soFar < 0 ? 'down' : 'up'} since week 1
                                    </p>
                                </li>
                            )}
                            {hint.next && (
                                <li className={DASH.rowWrap}>
                                    <AreaIcon
                                        icon={MILESTONE_STYLE[hint.next.kind].icon}
                                        tone={MILESTONE_STYLE[hint.next.kind].tone}
                                        size="sm"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] text-neutral-900">{hint.next.title}</p>
                                        <p className={`mt-0.5 ${DASH.note}`}>{hint.next.detail}</p>
                                    </div>
                                    <span className={`${DASH.rowValue} pt-0.5`}>
                                        {fromNow(today, hint.next.date, daysBetween(today, hint.next.date))}
                                    </span>
                                </li>
                            )}
                        </ul>
                    )}
                </>
            )}
        </DashSection>
    )
}

/** One segment a week: done, this one, still to come. */
function WeekBar({ week, total, progress }: { week: number; total: number; progress: number }) {
    const label = `Week ${week} of ${total}`
    if (total > MAX_SEGMENTS)
        return (
            <div className={`mt-4 ${DASH.track}`} role="img" aria-label={label}>
                <div className="h-full rounded-full bg-coral-500" style={{ width: `${progress * 100}%` }} />
            </div>
        )
    return (
        <div className="mt-4 flex gap-[3px]" role="img" aria-label={label}>
            {Array.from({ length: total }, (_, i) => (
                <span
                    key={i}
                    className={`h-1.5 min-w-0 flex-1 rounded-full ${
                        i + 1 < week ? 'bg-coral-500' : i + 1 === week ? 'bg-coral-300' : 'bg-neutral-200'
                    }`}
                />
            ))}
        </div>
    )
}
