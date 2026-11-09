import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import { DASH, SectionLoading } from '../components/dashboard/DashSection'
import { useWalks } from '../components/walking/useWalks'
import { useAuth } from '../context/AuthContext'
import { todayKey } from '../lib/calendar'
import { DAY_PARTS, partAt, type DayPart } from '../lib/yourDay'
import { formatMinutes, formatWalkKm, nextWalk, walkDayTotals, walkEstimate, walkFacts, walkPart, walkTitle, finishTime, type WalkDayTotals } from '../lib/walking'
import { setWalkDone, type Walk } from '../services/walks'

/**
 * Walking: a day of planned walks, laid out like Your day — the next one on the
 * left, the day by morning, afternoon and evening beside it. A walk is ticked
 * off by hand: Garmin's step count is for the whole day, not one walk.
 *
 * Figures use `.nums`, never `tabular-nums`, which switches to the mono face.
 */

const PART_LABEL: Record<DayPart, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }
const fmt = (n: number) => n.toLocaleString('en-GB')

function dateFromLink(raw: string | null): string {
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey()
}

export default function Walking() {
    const [params] = useSearchParams()
    const [date, setDate] = useState(() => dateFromLink(params.get('date')))
    const { walks, failed, weightKg, upsert } = useWalks(date)
    const navigate = useNavigate()
    const [error, setError] = useState('')
    const stepGoal = useAuth().user?.settings?.stepGoal

    const open = (walk: Walk | null) => navigate(walk ? `/walking/${walk._id}` : `/walking/new?date=${date}`)

    async function toggle(walk: Walk) {
        setError('')
        upsert({ ...walk, doneAt: walk.doneAt ? null : new Date().toISOString() })
        try {
            upsert(await setWalkDone(walk._id, !walk.doneAt))
        } catch {
            upsert(walk)
            setError('Couldn’t save that. Check your connection and try again.')
        }
    }

    const totals = useMemo(() => (walks ? walkDayTotals(walks, weightKg) : null), [walks, weightKg])
    const next = walks ? nextWalk(walks) : null
    const isToday = date === todayKey()
    const d = new Date()
    const nowPart = isToday ? partAt(d.getHours() * 60 + d.getMinutes()) : null

    return (
        <Container as="main" className="pb-20 pt-8 sm:pt-14">
            <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">Walking</h1>
                    <p className="mt-1 text-sm text-neutral-500">{summary(totals)}</p>
                </div>
                <DashboardDateNav date={date} onChange={setDate} />
            </header>

            {failed && (
                <p role="alert" className="mt-8 rounded-2xl bg-red-50/70 p-4 text-sm text-neutral-800">
                    Couldn’t load your walks. Check your connection and try again.
                </p>
            )}
            {error && (
                <p role="alert" className="mt-8 rounded-2xl bg-red-50/70 p-4 text-sm text-neutral-800">
                    {error}
                </p>
            )}

            {!walks ? (
                <div className="mt-10">
                    <SectionLoading rows={4} />
                </div>
            ) : (
                <>
                    {totals && totals.count > 0 && <Totals totals={totals} stepGoal={stepGoal} />}

                    <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-x-12">
                        <div className="self-start lg:col-span-4">
                            <NextWalk walk={next} walks={walks} weightKg={weightKg} onOpen={open} onToggle={toggle} />
                        </div>
                        <div className="min-w-0 lg:col-span-8">
                            <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
                                {DAY_PARTS.map((part) => (
                                    <PartColumn key={part} part={part} now={nowPart === part}>
                                        {walks
                                            .filter((w) => walkPart(w.time) === part)
                                            .map((w) => (
                                                <WalkRow key={w._id} walk={w} weightKg={weightKg} isNext={next?._id === w._id} onOpen={open} onToggle={toggle} />
                                            ))}
                                    </PartColumn>
                                ))}
                            </div>
                            <div className="mt-6">
                                <Button variant="secondary" icon="fa-solid fa-plus" onClick={() => open(null)}>
                                    New walk
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </Container>
    )
}

function summary(totals: WalkDayTotals | null): string {
    if (!totals) return 'Plan a walk, see the route and what it adds up to.'
    if (totals.count === 0) return 'Nothing planned for this day.'
    if (totals.done === totals.count) return `${totals.count === 1 ? 'Walk' : 'All walks'} done.`
    return `${totals.done} of ${totals.count} ${totals.count === 1 ? 'walk' : 'walks'} done`
}

function Totals({ totals, stepGoal }: { totals: WalkDayTotals; stepGoal?: number }) {
    const figures: { label: string; value: string; note?: string }[] = [
        { label: 'Distance', value: formatWalkKm(totals.distanceM) },
        { label: 'Time', value: formatMinutes(totals.minutes) },
        {
            label: 'Steps',
            value: fmt(totals.steps),
            note: stepGoal ? `${Math.round((totals.steps / stepGoal) * 100)}% of your ${fmt(stepGoal)} target` : undefined,
        },
        { label: 'Calories', value: totals.kcal === null ? '—' : `${fmt(totals.kcal)} kcal` },
    ]
    return (
        <div className="mt-10">
            <div className="flex gap-1" role="img" aria-label={`${totals.done} of ${totals.count} walks done`}>
                {Array.from({ length: totals.count }, (_, i) => (
                    <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-full ${i < totals.done ? 'bg-success' : 'bg-neutral-200'}`} />
                ))}
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {figures.map((f) => (
                    <div key={f.label} className="min-w-0">
                        <dt className={DASH.subhead}>{f.label} planned</dt>
                        <dd className={`mt-0.5 ${DASH.figureSm}`}>{f.value}</dd>
                        {f.note && <dd className={`mt-0.5 ${DASH.note} nums`}>{f.note}</dd>}
                    </div>
                ))}
            </dl>
        </div>
    )
}

function NextWalk({
    walk,
    walks,
    weightKg,
    onOpen,
    onToggle,
}: {
    walk: Walk | null
    walks: Walk[]
    weightKg: number | null
    onOpen: (walk: Walk | null) => void
    onToggle: (walk: Walk) => void
}) {
    const panel = 'rounded-3xl p-6 sm:p-7'
    const overline = 'text-[11px] font-medium uppercase tracking-[0.06em]'
    if (!walk)
        return walks.length > 0 ? (
            <div className={`${panel} bg-success-bg`}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-success text-white" aria-hidden="true">
                    <i className="fa-solid fa-check" />
                </span>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-neutral-950">All walked</p>
                <p className="mt-1 text-[14px] leading-6 text-neutral-600">Nothing left on this day.</p>
            </div>
        ) : (
            <div className={`${panel} bg-neutral-100`}>
                <p className={`${overline} text-neutral-500`}>Next walk</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-neutral-950">Nothing planned</p>
                <p className="mt-1 text-[14px] leading-6 text-neutral-600">Set a target and a start, and get a route to follow.</p>
                <Button className="mt-6" fullWidth size="lg" icon="fa-solid fa-plus" onClick={() => onOpen(null)}>
                    Plan a walk
                </Button>
            </div>
        )

    const e = walkEstimate(walk, weightKg)
    const stops = walk.stops.length
    const lightButton = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors'
    return (
        <div className={`${panel} bg-neutral-900 text-white`}>
            <p className={`${overline} text-neutral-400`}>
                Next walk · {walk.time}
                {e ? `–${finishTime(walk.time, e.minutes)}` : ''}
            </p>
            <p className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.025em]">{walkTitle(walk)}</p>
            {e && (
                <p className="nums mt-1.5 text-[14px] leading-6 text-neutral-300">
                    {[formatWalkKm(e.distanceM), `${fmt(e.steps)} steps`, e.kcal === null ? null : `${fmt(e.kcal)} kcal`].filter(Boolean).join(' · ')}
                </p>
            )}
            <p className="mt-1 truncate text-[13px] text-neutral-400">
                From {walk.start.label || 'your start'}
                {stops > 0 ? ` · passing ${stops} ${stops === 1 ? 'place' : 'places'}` : ''}
                {!walk.route ? ' · no route yet' : ''}
            </p>
            <div className="mt-6 flex flex-col gap-2">
                <button type="button" className={`${lightButton} bg-white text-neutral-900 hover:bg-neutral-100`} onClick={() => onOpen(walk)}>
                    {walk.route ? 'See the route' : 'Add a route'}
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </button>
                <button type="button" className={`${lightButton} text-neutral-200 hover:bg-white/10`} onClick={() => onToggle(walk)}>
                    <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                    Mark as done
                </button>
            </div>
        </div>
    )
}

function PartColumn({ part, now, children }: { part: DayPart; now: boolean; children: ReactNode[] }) {
    return (
        <div className="min-w-0">
            <div className="mb-2 flex h-6 items-center gap-2">
                <p className="text-[13px] font-medium text-neutral-600">{PART_LABEL[part]}</p>
                {now && <span className="inline-flex h-5 items-center rounded-full bg-coral-50 px-2 text-[11px] font-semibold text-coral-600">Now</span>}
            </div>
            {children.length === 0 ? (
                <p className="border-y border-neutral-200 py-3 text-[14px] text-neutral-400">Nothing planned</p>
            ) : (
                <ul className={DASH.list}>{children}</ul>
            )}
        </div>
    )
}

function WalkRow({
    walk,
    weightKg,
    isNext,
    onOpen,
    onToggle,
}: {
    walk: Walk
    weightKg: number | null
    isNext: boolean
    onOpen: (walk: Walk) => void
    onToggle: (walk: Walk) => void
}) {
    const done = !!walk.doneAt
    const title = walkTitle(walk)
    return (
        <li className="flex items-start gap-1">
            {/* The mark stays 20px; the padding makes it a thumb-sized target. */}
            <button
                type="button"
                className="group -ml-3 shrink-0 p-3"
                aria-pressed={done}
                aria-label={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
                onClick={() => onToggle(walk)}
            >
                {done ? (
                    <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-success text-[10px] text-white">
                        <i className="fa-solid fa-check" aria-hidden="true" />
                    </span>
                ) : (
                    <span className={`mt-0.5 grid h-5 w-5 place-items-center rounded-full ring-[1.5px] ring-inset ${isNext ? 'ring-coral-500' : 'ring-neutral-300 group-hover:ring-neutral-500'}`}>
                        {isNext && <span className="h-2 w-2 rounded-full bg-coral-500" />}
                    </span>
                )}
            </button>
            <button type="button" className="group min-w-0 flex-1 py-3 text-left" onClick={() => onOpen(walk)}>
                <p className={`truncate text-[15px] group-hover:underline group-hover:underline-offset-4 ${done ? 'text-neutral-500' : 'text-neutral-900'} ${isNext ? 'font-medium' : ''}`}>
                    {title}
                </p>
                <p className="nums mt-0.5 truncate text-[13px] text-neutral-500">{walkFacts(walk, weightKg)}</p>
            </button>
        </li>
    )
}
