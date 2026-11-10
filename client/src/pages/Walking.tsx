import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import ConfirmModal from '../components/ConfirmModal'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import { AreaIcon, DASH, DASH_CARD, SectionLoading } from '../components/dashboard/DashSection'
import { useWalks } from '../components/walking/useWalks'
import LibraryPicker from '../components/walking/LibraryPicker'
import { useAuth } from '../context/AuthContext'
import { todayKey } from '../lib/calendar'
import { DAY_PARTS, partAt, type DayPart } from '../lib/yourDay'
import { formatGoal, libraryTitle, formatMinutes, formatWalkKm, nextWalk, walkDayTotals, walkEstimate, walkPart, sortWalks, walkTitle, finishTime, type WalkDayTotals } from '../lib/walking'
import { deleteWalk, listLibrary, setWalkDone, type Walk, type WalkLibraryItem } from '../services/walks'

/**
 * Walking: a day of planned walks, laid out like Home — the day's tally and
 * totals in one strip, then the plan on a card (the next walk on top, the day
 * by morning, afternoon and evening under it) with the library beside it. A
 * walk is ticked off by hand: Garmin's step count is for the whole day, not
 * one walk.
 *
 * Figures use `.nums`, never `tabular-nums`, which switches to the mono face.
 */

const PART_LABEL: Record<DayPart, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }
const fmt = (n: number) => n.toLocaleString('en-GB')
const OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em]'

function dateFromLink(raw: string | null): string {
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey()
}

export default function Walking() {
    const [params] = useSearchParams()
    const [date, setDate] = useState(() => dateFromLink(params.get('date')))
    const { walks, failed, weightKg, upsert, remove } = useWalks(date)
    const [removing, setRemoving] = useState<Walk | null>(null)
    const navigate = useNavigate()
    const [error, setError] = useState('')
    const stepGoal = useAuth().user?.settings?.stepGoal

    const open = (walk: Walk) => navigate(`/walking/${walk._id}`)
    const [library, setLibrary] = useState<WalkLibraryItem[] | null>(null)
    const [libraryFailed, setLibraryFailed] = useState(false)
    const [slot, setSlot] = useState<DayPart | null>(null)
    // Kept while the picker slides shut.
    const [lastSlot, setLastSlot] = useState<DayPart>('morning')
    const pickSlot = (part: DayPart) => {
        setLastSlot(part)
        setSlot(part)
    }

    useEffect(() => {
        let live = true
        listLibrary()
            .then((items) => live && setLibrary(items))
            .catch(() => {
                if (!live) return
                setLibrary([])
                setLibraryFailed(true)
            })
        return () => {
            live = false
        }
    }, [])

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

    async function removeWalk(walk: Walk) {
        setError('')
        remove(walk._id)
        try {
            await deleteWalk(walk._id)
        } catch {
            upsert(walk)
            setError('Couldn’t remove that walk. Check your connection and try again.')
        }
    }

    const totals = useMemo(() => (walks ? walkDayTotals(walks, weightKg) : null), [walks, weightKg])
    const next = walks ? nextWalk(walks) : null
    const isToday = date === todayKey()
    const d = new Date()
    const nowPart = isToday ? partAt(d.getHours() * 60 + d.getMinutes()) : null

    return (
        <Container as="main" wide className="pb-20 pt-8 sm:pt-12">
            <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-area-walking-bg text-[17px] text-area-walking" aria-hidden="true">
                        <i className="fa-solid fa-person-walking" />
                    </span>
                    <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-neutral-950 sm:text-[40px]">Walking</h1>
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

            {/* The day's tally and what the walks add up to, so the state of the day reads first. */}
            <div className={`${DASH_CARD} mt-8 flex flex-wrap items-center justify-between gap-x-10 gap-y-5 sm:mt-10`}>
                <div className="flex min-w-0 items-center gap-4">
                    {totals && totals.count > 0 ? <DoneRing totals={totals} /> : <AreaIcon icon="fa-solid fa-shoe-prints" tone="green" />}
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-[-0.015em] text-neutral-900">{isToday ? 'Today’s walks' : 'Walks'}</h2>
                        <p className="mt-0.5 truncate text-[13px] text-neutral-500">{summary(totals)}</p>
                    </div>
                </div>
                {totals && totals.count > 0 && <Totals totals={totals} stepGoal={stepGoal} />}
            </div>

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-12">
                <div className={`${DASH_CARD} min-w-0 !p-2 sm:!p-2 lg:col-span-8`}>
                    {!walks ? (
                        <div className="p-4">
                            <SectionLoading rows={5} />
                        </div>
                    ) : (
                        <>
                            <NextWalk walk={next} walks={walks} weightKg={weightKg} onOpen={open} onToggle={toggle} onAdd={() => pickSlot(nowPart ?? 'morning')} />
                            <div className="flex flex-col gap-2 pt-2">
                                {DAY_PARTS.map((part) => {
                                    const own = sortWalks(walks.filter((w) => walkPart(w.time) === part))
                                    const passed = nowPart !== null && DAY_PARTS.indexOf(part) < DAY_PARTS.indexOf(nowPart)
                                    return (
                                        <PartGroup key={part} part={part} now={nowPart === part} passed={passed} walks={own} onAdd={() => pickSlot(part)}>
                                            {own.map((w) => (
                                                <WalkRow key={w._id} walk={w} weightKg={weightKg} isNext={next?._id === w._id} onOpen={open} onToggle={toggle} onRemove={setRemoving} />
                                            ))}
                                        </PartGroup>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>

                <div className="min-w-0 lg:col-span-4">
                    <Library items={library} failed={libraryFailed} weightKg={weightKg} onOpen={(id) => navigate(`/walking/library/${id}`)} onNew={() => navigate('/walking/library/new')} />
                </div>
            </div>

            <ConfirmModal
                open={!!removing}
                title="Remove this walk?"
                message={
                    removing?.series
                        ? 'Just this day. It keeps repeating on the others — to stop it, open it and set Repeat to Just this day.'
                        : 'It comes off this day. Anything in your library stays.'
                }
                confirmLabel="Remove walk"
                danger
                onConfirm={() => removing && void removeWalk(removing)}
                onClose={() => setRemoving(null)}
            />

            <LibraryPicker open={!!slot} part={slot ?? lastSlot} date={date} items={library ?? []} weightKg={weightKg} onClose={() => setSlot(null)} onAssigned={upsert} />
        </Container>
    )
}

function summary(totals: WalkDayTotals | null): string {
    if (!totals) return 'Plan a walk, see the route and what it adds up to.'
    if (totals.count === 0) return 'Nothing planned for this day.'
    if (totals.done === totals.count) return `${totals.count === 1 ? 'Walk' : 'All walks'} done.`
    return `${totals.done} of ${totals.count} ${totals.count === 1 ? 'walk' : 'walks'} done`
}

/** Walks done out of planned as a ring, with the count in the middle — Your day's score ring. */
function DoneRing({ totals }: { totals: WalkDayTotals }) {
    const r = 21
    const length = 2 * Math.PI * r
    const share = totals.count ? totals.done / totals.count : 0
    const all = totals.done === totals.count
    return (
        <div className="relative grid h-14 w-14 shrink-0 place-items-center" role="img" aria-label={`${totals.done} of ${totals.count} walks done`}>
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 52 52" aria-hidden="true">
                <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-neutral-200" />
                <circle
                    cx="26"
                    cy="26"
                    r={r}
                    fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className={`${all ? 'stroke-success' : 'stroke-neutral-900'} transition-[stroke-dasharray] duration-500`}
                    strokeDasharray={`${Math.max(share * length, share > 0 ? 1 : 0)} ${length}`}
                />
            </svg>
            <span className="nums text-[13px] font-medium text-neutral-900">
                {totals.done}/{totals.count}
            </span>
        </div>
    )
}

/** What the day's walks add up to; steps get a bar against the daily target when there is one. */
function Totals({ totals, stepGoal }: { totals: WalkDayTotals; stepGoal?: number }) {
    const figures: { label: string; value: string }[] = [
        { label: 'Distance', value: formatWalkKm(totals.distanceM) },
        { label: 'Time', value: formatMinutes(totals.minutes) },
        { label: 'Calories', value: totals.kcal === null ? '—' : `${fmt(totals.kcal)} kcal` },
    ]
    return (
        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:w-auto sm:items-end sm:gap-8">
            <div className="min-w-0 sm:w-40">
                <dt className="text-[12px] text-neutral-500">Steps</dt>
                <dd className="nums mt-0.5 truncate text-[15px] font-medium text-neutral-900">
                    {fmt(totals.steps)}
                    {stepGoal ? <span className="font-normal text-neutral-500"> / {fmt(stepGoal)}</span> : null}
                </dd>
                {stepGoal ? (
                    <dd className={`mt-1.5 ${DASH.track}`}>
                        <div
                            className={`h-full rounded-full ${totals.steps >= stepGoal ? 'bg-success' : 'bg-neutral-900'}`}
                            style={{ width: `${Math.min(100, (totals.steps / stepGoal) * 100)}%` }}
                        />
                    </dd>
                ) : null}
            </div>
            {figures.map((f) => (
                <div key={f.label} className="min-w-0">
                    <dt className="text-[12px] text-neutral-500">{f.label}</dt>
                    <dd className="nums mt-0.5 truncate text-[15px] font-medium text-neutral-900">{f.value}</dd>
                </div>
            ))}
        </dl>
    )
}

/** The next walk to do, dark like Home's Next up — or a quiet panel when there isn't one. */
function NextWalk({
    walk,
    walks,
    weightKg,
    onOpen,
    onToggle,
    onAdd,
}: {
    walk: Walk | null
    walks: Walk[]
    weightKg: number | null
    onOpen: (walk: Walk) => void
    onToggle: (walk: Walk) => void
    onAdd: () => void
}) {
    const panel = 'rounded-2xl p-5 sm:p-6'
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
            <div className={`${panel} flex flex-col gap-5 bg-neutral-100 sm:flex-row sm:items-end sm:justify-between`}>
                <div className="min-w-0">
                    <p className={`${OVERLINE} text-neutral-500`}>Next walk</p>
                    <p className="mt-2.5 text-2xl font-semibold tracking-[-0.025em] text-neutral-950">Nothing planned</p>
                    <p className="mt-1 text-[14px] leading-6 text-neutral-600">Pick a walk from your library, or make a new one.</p>
                </div>
                <Button className="w-full shrink-0 sm:w-auto" icon="fa-solid fa-plus" onClick={onAdd}>
                    Add a walk
                </Button>
            </div>
        )

    const e = walkEstimate(walk, weightKg)
    const stops = walk.stops.length
    const button = 'flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition-colors sm:w-auto'
    return (
        <div className={`${panel} flex flex-col gap-5 bg-neutral-900 text-white sm:flex-row sm:items-end sm:justify-between`}>
            <div className="min-w-0">
                <p className={`${OVERLINE} flex items-center gap-2 text-neutral-400`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-coral-400" aria-hidden="true" />
                    Next walk · {walk.time}
                    {e ? `–${finishTime(walk.time, e.minutes)}` : ''}
                </p>
                <p className="mt-2.5 text-2xl font-semibold leading-tight tracking-[-0.025em]">{walkTitle(walk)}</p>
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
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" className={`${button} text-neutral-200 hover:bg-white/10`} onClick={() => onToggle(walk)}>
                    <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                    Mark as done
                </button>
                <button type="button" className={`${button} bg-white text-neutral-900 hover:bg-neutral-100`} onClick={() => onOpen(walk)}>
                    {walk.route ? 'See the route' : 'Add a route'}
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </button>
            </div>
        </div>
    )
}

/** Saved walks on their own card beside the day, ready to put on any day. */
function Library({
    items,
    failed,
    weightKg,
    onOpen,
    onNew,
}: {
    items: WalkLibraryItem[] | null
    failed: boolean
    weightKg: number | null
    onOpen: (id: string) => void
    onNew: () => void
}) {
    return (
        <section className={DASH_CARD} aria-label="Walk library">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <AreaIcon icon="fa-solid fa-bookmark" tone="green" />
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-[-0.015em] text-neutral-900">Library</h2>
                        <p className="mt-0.5 truncate text-[13px] text-neutral-500">Ready to put on any day</p>
                    </div>
                </div>
                <Button variant="secondary" size="sm" icon="fa-solid fa-plus" onClick={onNew}>
                    New
                </Button>
            </div>
            {!items ? (
                <SectionLoading />
            ) : failed ? (
                <p className="rounded-xl bg-neutral-50 px-4 py-3 text-[14px] text-neutral-600">Couldn’t load your library.</p>
            ) : items.length === 0 ? (
                <p className="rounded-xl bg-neutral-50 px-4 py-3 text-[14px] text-neutral-600">No walks yet. New walks you make are kept here.</p>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {items.map((item) => {
                        const e = walkEstimate(item, weightKg)
                        return (
                            <li key={item._id} className="border-t border-neutral-100 first:border-t-0">
                                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-neutral-50" onClick={() => onOpen(item._id)}>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[15px] text-neutral-900">{libraryTitle(item)}</span>
                                        <span className="nums mt-0.5 block truncate text-[13px] text-neutral-500">
                                            {[e ? formatWalkKm(e.distanceM) : null, formatGoal(item.goal), item.route ? null : 'No route yet'].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <i className="fa-solid fa-chevron-right shrink-0 text-[11px] text-neutral-300" aria-hidden="true" />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}

/** Each part of the day's icon and the hours it covers (the same split as Your day: 12:00 and 17:00). */
const PART_META: Record<DayPart, { icon: string; hours: string }> = {
    morning: { icon: 'fa-mug-saucer', hours: 'Until 12:00' },
    afternoon: { icon: 'fa-sun', hours: '12:00 – 17:00' },
    evening: { icon: 'fa-moon', hours: 'From 17:00' },
}

/**
 * One part of the day as a slot: an icon, its name and hours, Now when it's the
 * current one, a done count and a quick add. Its walks sit inside as small
 * cards; an empty slot is one dashed button to add a walk.
 */
function PartGroup({
    part,
    now,
    passed,
    walks,
    onAdd,
    children,
}: {
    part: DayPart
    now: boolean
    /** Earlier today than the current part, so its heading goes quiet. */
    passed: boolean
    walks: Walk[]
    onAdd: () => void
    children: ReactNode[]
}) {
    const meta = PART_META[part]
    const done = walks.filter((w) => w.doneAt).length
    const allDone = walks.length > 0 && done === walks.length
    return (
        <section
            aria-label={PART_LABEL[part]}
            className={`min-w-0 rounded-2xl p-2 transition-colors ${now ? 'bg-coral-50/50 ring-1 ring-inset ring-coral-100' : 'bg-neutral-50'}`}
        >
            <div className="flex min-h-11 items-center gap-3 pl-2">
                <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white text-[13px] shadow-sm ring-1 ring-neutral-900/[0.05] ${
                        now ? 'text-coral-600' : passed ? 'text-neutral-400' : 'text-neutral-600'
                    }`}
                    aria-hidden="true"
                >
                    <i className={`fa-solid ${meta.icon}`} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className={`text-[15px] font-semibold tracking-[-0.01em] ${passed ? 'text-neutral-500' : 'text-neutral-900'}`}>{PART_LABEL[part]}</h3>
                        {now && <span className="inline-flex h-5 items-center rounded-full bg-coral-500 px-2 text-[11px] font-semibold text-white">Now</span>}
                    </div>
                    <p className="nums text-[12px] text-neutral-500">{meta.hours}</p>
                </div>
                {walks.length > 0 && (
                    <span
                        className={`nums inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ${
                            allDone ? 'bg-success-bg text-success' : 'bg-white text-neutral-600 ring-1 ring-inset ring-neutral-900/[0.06]'
                        }`}
                    >
                        {allDone && <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />}
                        {done} of {walks.length}
                    </span>
                )}
                {walks.length > 0 && (
                    <button
                        type="button"
                        onClick={onAdd}
                        aria-label={`Add a ${part} walk`}
                        title={`Add a ${part} walk`}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xs text-neutral-500 transition-colors hover:bg-white hover:text-neutral-900"
                    >
                        <i className="fa-solid fa-plus" aria-hidden="true" />
                    </button>
                )}
            </div>

            {children.length === 0 ? (
                <button
                    type="button"
                    onClick={onAdd}
                    className="mt-1.5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 text-sm font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:bg-white hover:text-neutral-900"
                >
                    <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                    Add a {part} walk
                </button>
            ) : (
                <ul className="mt-1.5 flex flex-col gap-1.5">{children}</ul>
            )}
        </section>
    )
}

/**
 * One walk as a small card: start and finish down the left like a timetable,
 * the name and what it adds up to, then tick and remove on the right.
 */
function WalkRow({
    walk,
    weightKg,
    isNext,
    onOpen,
    onToggle,
    onRemove,
}: {
    walk: Walk
    weightKg: number | null
    isNext: boolean
    onOpen: (walk: Walk) => void
    onToggle: (walk: Walk) => void
    onRemove: (walk: Walk) => void
}) {
    const done = !!walk.doneAt
    const title = walkTitle(walk)
    const e = walkEstimate(walk, weightKg)
    const facts = [e ? formatWalkKm(e.distanceM) : null, e ? formatMinutes(e.minutes) : null, e ? `${fmt(e.steps)} steps` : null, walk.route ? null : 'No route yet']
        .filter(Boolean)
        .join(' · ')
    return (
        <li
            className={`flex items-stretch rounded-xl bg-white shadow-sm ring-1 transition-shadow hover:shadow-md ${
                isNext ? 'ring-coral-300' : 'ring-neutral-900/[0.06]'
            }`}
        >
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3.5 py-3 pl-3.5 text-left sm:gap-4" onClick={() => onOpen(walk)}>
                <span className={`nums w-12 shrink-0 ${done ? 'text-neutral-400' : ''}`}>
                    <span className={`block text-[15px] font-semibold leading-5 ${done ? '' : 'text-neutral-900'}`}>{walk.time}</span>
                    {e && <span className="block text-[12px] leading-4 text-neutral-500">{finishTime(walk.time, e.minutes)}</span>}
                </span>
                <span className={`h-9 w-[3px] shrink-0 rounded-full ${done ? 'bg-success' : isNext ? 'bg-coral-500' : 'bg-area-walking/25'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className={`truncate text-[15px] font-medium ${done ? 'text-neutral-500 line-through decoration-neutral-300' : 'text-neutral-900'}`}>{title}</span>
                        {walk.series && <i className="fa-solid fa-repeat shrink-0 text-[11px] text-neutral-400" aria-label="Repeats" />}
                        {isNext && !done && <span className="hidden h-5 shrink-0 items-center rounded-full bg-coral-50 px-2 text-[11px] font-semibold text-coral-700 sm:inline-flex">Next</span>}
                    </span>
                    {facts && <span className="nums mt-0.5 block truncate text-[13px] text-neutral-500">{facts}</span>}
                </span>
            </button>
            <div className="flex shrink-0 items-center pr-1">
                <button
                    type="button"
                    aria-pressed={done}
                    aria-label={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
                    title={done ? 'Mark as not done' : 'Mark as done'}
                    onClick={() => onToggle(walk)}
                    className="group grid h-11 w-11 place-items-center rounded-lg"
                >
                    {done ? (
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-success text-[11px] text-white">
                            <i className="fa-solid fa-check" aria-hidden="true" />
                        </span>
                    ) : (
                        <span
                            className={`grid h-7 w-7 place-items-center rounded-full text-[11px] text-transparent ring-[1.5px] ring-inset transition-colors group-hover:text-neutral-500 ${
                                isNext ? 'ring-coral-500' : 'ring-neutral-300 group-hover:ring-neutral-500'
                            }`}
                        >
                            <i className="fa-solid fa-check" aria-hidden="true" />
                        </span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => onRemove(walk)}
                    aria-label={`Remove ${title}`}
                    title="Remove from this day"
                    className="grid h-11 w-9 place-items-center rounded-lg text-xs text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
            </div>
        </li>
    )
}
