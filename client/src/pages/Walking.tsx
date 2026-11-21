import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ModuleLayout from '../components/ModuleLayout'
import { BarButton, CAPS, DoneTick, Eyebrow, FigureStrip, Lead, ModuleBar, PageTitle, SectionTitle } from '../components/Blok'
import { LastTwelveWeeks, StepsByDay } from '../components/walking/StepsCharts'
import { useSteps } from '../components/dashboard/useSteps'
import Button from '../components/Button'
import ConfirmModal from '../components/ConfirmModal'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import { AreaIcon, DASH_CARD, SectionLoading } from '../components/dashboard/DashSection'
import { useWalks } from '../components/walking/useWalks'
import LibraryPicker from '../components/walking/LibraryPicker'
import { useAuth } from '../context/AuthContext'
import { addDays, todayKey } from '../lib/calendar'
import { DAY_PARTS, partAt, type DayPart } from '../lib/yourDay'
import { SLOT_TIMES, PART_HOURS, PART_NAME, formatGoal, libraryTitle, formatMinutes, formatWalkKm, nextWalk, walkDayTotals, walkEstimate, walkPart, sortWalks, walkTitle, type WalkDayTotals } from '../lib/walking'
import { assignLibraryItem, deleteWalk, listLibrary, setWalkDone, type Walk, type WalkLibraryItem } from '../services/walks'

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
/** Drag payload for a library walk, so other drags (text, files) never land on a slot. */
const LIBRARY_DRAG = 'application/x-walk-library'

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

    // Dropping a library walk on a part of the day copies it there at the slot's usual time.
    const [dropping, setDropping] = useState<DayPart | null>(null)
    async function dropOn(part: DayPart, id: string) {
        setError('')
        setDropping(part)
        try {
            upsert(await assignLibraryItem(id, date, SLOT_TIMES[part]))
        } catch {
            setError('Couldn’t add that walk. Check your connection and try again.')
        } finally {
            setDropping(null)
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

    const steps = useSteps(todayKey())
    const stepDays = steps.days ?? []
    const todaySteps = stepDays.find((x) => x.date === todayKey())?.steps ?? null
    const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i - 6)).map((day) => stepDays.find((x) => x.date === day)?.steps ?? null)
    const full6 = last7.slice(0, 6).filter((n): n is number => n !== null)
    const avg7 = last7.filter((n): n is number => n !== null)
    const average = avg7.length ? Math.round(avg7.reduce((x, y) => x + y, 0) / avg7.length) : null
    const hitDays = stepGoal ? full6.filter((n) => n >= stepGoal).length : 0
    const nf = (n: number) => n.toLocaleString('en-GB')
    const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

    return (
        <>
        <ModuleBar
            title="Walking"
            actions={
                <>
                    <DashboardDateNav date={date} onChange={setDate} />
                    <BarButton solid arrow onClick={() => pickSlot(nowPart ?? 'morning')}>
                        Plan a walk
                    </BarButton>
                </>
            }
        />
        <ModuleLayout
            asideLabel="Routes"
            aside={<Library items={library} failed={libraryFailed} weightKg={weightKg} onOpen={(id) => navigate(`/walking/library/${id}`)} onNew={() => navigate('/walking/library/new')} />}
        >
        <main className="px-5 pb-24 pt-10 sm:px-10">
            <Eyebrow>{dateLabel}</Eyebrow>
            <div className="mt-4">
                <PageTitle>{isToday && todaySteps !== null ? `${nf(todaySteps)} steps` : isToday ? 'Today’s walks' : 'Walks'}</PageTitle>
            </div>
            <Lead>{summary(totals)}</Lead>

            {failed && (
                <p role="alert" className="mt-8 border border-neutral-900 p-4 text-sm">
                    Couldn’t load your walks. Check your connection and try again.
                </p>
            )}
            {error && (
                <p role="alert" className="mt-8 border border-neutral-900 p-4 text-sm">
                    {error}
                </p>
            )}

            <div className="mt-12">
                <FigureStrip
                    figures={[
                        {
                            label: 'Today',
                            value: todaySteps !== null ? nf(todaySteps) : '—',
                            unit: stepGoal ? `of ${nf(stepGoal)}` : 'steps',
                            pct: stepGoal && todaySteps !== null ? (todaySteps / stepGoal) * 100 : undefined,
                            color: '#4f7a63',
                            note: stepGoal && todaySteps !== null ? (todaySteps >= stepGoal ? 'Target hit' : `${nf(stepGoal - todaySteps)} to go`) : undefined,
                        },
                        {
                            label: '7-day average',
                            value: average !== null ? nf(average) : '—',
                            unit: 'steps',
                            pct: stepGoal && average !== null ? (average / stepGoal) * 100 : undefined,
                            color: '#4f7a63',
                            note: stepGoal && average !== null ? `${Math.abs(Math.round((1 - average / stepGoal) * 100))}% ${average >= stepGoal ? 'over' : 'under'} target` : undefined,
                        },
                        {
                            label: 'Target hit',
                            value: String(hitDays),
                            unit: `of ${full6.length} days`,
                            pct: full6.length ? (hitDays / full6.length) * 100 : undefined,
                            color: '#4f7a63',
                            note: 'The six days before today',
                        },
                        {
                            label: 'Walks',
                            value: totals ? String(totals.done) : '—',
                            unit: totals ? `of ${totals.count}` : undefined,
                            pct: totals && totals.count ? (totals.done / totals.count) * 100 : undefined,
                            color: '#4f7a63',
                            note: isToday ? 'Today' : dateLabel,
                        },
                    ]}
                />
            </div>

            <section aria-label="Walks" className="mt-16">
                <SectionTitle>{isToday ? 'Today’s walks' : 'Walks'}</SectionTitle>
                <div className="mt-6">
                    {!walks ? (
                        <SectionLoading rows={5} />
                    ) : (
                        <>
                            <NextWalk walk={next} walks={walks} weightKg={weightKg} onOpen={open} onToggle={toggle} onAdd={() => pickSlot(nowPart ?? 'morning')} />
                            <div className="mt-10 border-t border-neutral-900">
                                {DAY_PARTS.map((part) => {
                                    const own = sortWalks(walks.filter((w) => walkPart(w.time) === part))
                                    const passed = nowPart !== null && DAY_PARTS.indexOf(part) < DAY_PARTS.indexOf(nowPart)
                                    return (
                                        <PartGroup key={part} part={part} now={nowPart === part} passed={passed} walks={own} onAdd={() => pickSlot(part)} onDropItem={(id) => void dropOn(part, id)} busy={dropping === part}>
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
            </section>

            {stepDays.length > 0 && (
                <section aria-label="Steps" className="mt-16 grid grid-cols-1 gap-14 lg:grid-cols-2">
                    <StepsByDay days={stepDays} today={todayKey()} goal={stepGoal} />
                    <LastTwelveWeeks days={stepDays} today={todayKey()} goal={stepGoal || 10000} />
                </section>
            )}

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
        </main>
        </ModuleLayout>
        </>
    )
}

function summary(totals: WalkDayTotals | null): string {
    if (!totals) return 'Plan a walk, see the route and what it adds up to.'
    if (totals.count === 0) return 'Nothing planned for this day.'
    if (totals.done === totals.count) return `${totals.count === 1 ? 'Walk' : 'All walks'} done.`
    return `${totals.done} of ${totals.count} ${totals.count === 1 ? 'walk' : 'walks'} done`
}



/** The next walk to do, a black block on top of the list — or a quiet one when there isn't one. */
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
    const panel = 'p-5 sm:p-7'
    if (!walk)
        return walks.length > 0 ? (
            <div className={`${panel} flex items-center gap-4 bg-area-walking-bg`}>
                <DoneTick size={22} label="All done" />
                <div>
                    <p className="text-[22px] leading-tight tracking-[-0.02em] text-neutral-950">All walked</p>
                    <p className="mt-1 text-[14px] text-neutral-600">Nothing left on this day.</p>
                </div>
            </div>
        ) : (
            <div className={`${panel} flex flex-col gap-5 bg-neutral-100 sm:flex-row sm:items-end sm:justify-between`}>
                <div className="min-w-0">
                    <Eyebrow>Next walk</Eyebrow>
                    <p className="mt-3 text-[26px] leading-[1.15] tracking-[-0.02em] text-neutral-950">Nothing planned</p>
                    <p className="mt-1 text-[14px] leading-6 text-neutral-600">Pick a walk from your library, or make a new one.</p>
                </div>
                <BarButton solid arrow className="w-full sm:w-auto" onClick={onAdd}>
                    Add a walk
                </BarButton>
            </div>
        )

    const e = walkEstimate(walk, weightKg)
    const stops = walk.stops.length
    const button = `inline-flex h-11 w-full shrink-0 items-center justify-center gap-2.5 px-[18px] lg:h-10 sm:w-auto ${CAPS}`
    return (
        <div className={`${panel} flex flex-col gap-6 bg-neutral-900 text-white sm:flex-row sm:items-end sm:justify-between`}>
            <div className="min-w-0">
                <p className={`${CAPS} nums text-neutral-400`}>
                    Next walk · {PART_NAME[walkPart(walk.time)]} · {PART_HOURS[walkPart(walk.time)]}
                    {e ? ` · ${formatMinutes(e.minutes)}` : ''}
                </p>
                <p className="mt-3 text-[30px] leading-[1.1] tracking-[-0.025em] sm:text-[36px]">{walkTitle(walk)}</p>
                {e && (
                    <p className="nums mt-2.5 text-[15px] text-neutral-300">
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
                <button type="button" className={`${button} border border-white/30 text-white hover:border-white`} onClick={() => onToggle(walk)}>
                    Mark as done
                </button>
                <button type="button" className={`${button} bg-white text-neutral-900 hover:bg-neutral-200`} onClick={() => onOpen(walk)}>
                    {walk.route ? 'See the route' : 'Add a route'}
                    <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden="true" />
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
                        <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                            <span className="hidden lg:inline">Drag one onto a part of the day</span>
                            <span className="lg:hidden">Ready to put on any day</span>
                        </p>
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
                                <button
                                    type="button"
                                    draggable
                                    onDragStart={(ev) => {
                                        ev.dataTransfer.setData(LIBRARY_DRAG, item._id)
                                        ev.dataTransfer.effectAllowed = 'copy'
                                    }}
                                    className="flex w-full cursor-grab items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-neutral-50 active:cursor-grabbing"
                                    onClick={() => onOpen(item._id)}
                                >
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

/**
 * One part of the day as a ruled row, like a timetable: its name, hours and
 * done count in the left column, its walks down the right, each on its own
 * line, with an add line at the foot. Library walks can be dropped on it.
 */
function PartGroup({
    part,
    now,
    passed,
    walks,
    onAdd,
    onDropItem,
    busy,
    children,
}: {
    part: DayPart
    now: boolean
    /** Earlier today than the current part, so its heading goes quiet. */
    passed: boolean
    walks: Walk[]
    onAdd: () => void
    /** A library walk dropped on this part of the day. */
    onDropItem: (libraryId: string) => void
    /** A dropped walk is being saved here. */
    busy: boolean
    children: ReactNode[]
}) {
    const [over, setOver] = useState(false)
    const accepts = (ev: DragEvent) => ev.dataTransfer.types.includes(LIBRARY_DRAG)
    const done = walks.filter((w) => w.doneAt).length
    return (
        <section
            aria-label={PART_LABEL[part]}
            aria-busy={busy}
            onDragEnter={(ev) => {
                if (!accepts(ev)) return
                ev.preventDefault()
                setOver(true)
            }}
            onDragOver={(ev) => {
                if (!accepts(ev)) return
                ev.preventDefault()
                ev.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={(ev) => {
                // Only when the pointer leaves the slot, not when it crosses a child.
                if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOver(false)
            }}
            onDrop={(ev) => {
                const id = ev.dataTransfer.getData(LIBRARY_DRAG)
                setOver(false)
                if (!id) return
                ev.preventDefault()
                onDropItem(id)
            }}
            className="relative isolate grid grid-cols-1 border-b border-hairline sm:grid-cols-[minmax(150px,200px)_minmax(0,1fr)]"
        >
            {/* The drop highlight reaches past the slot's edges so the text inside keeps its line with the list. */}
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute -inset-x-4 -inset-y-px -z-10 border-2 border-area-walking bg-area-walking-bg transition-opacity sm:-inset-x-5 ${
                    over ? 'opacity-100' : 'opacity-0'
                }`}
            />
            <header className="flex items-baseline justify-between gap-4 pb-1 pt-5 sm:block sm:py-5 sm:pr-6">
                <h3 className={`flex items-center gap-2 ${CAPS} ${passed ? 'text-neutral-400' : 'text-neutral-900'}`}>
                    {PART_LABEL[part]}
                    {now && <span className="bg-neutral-900 px-1.5 py-[3px] text-[10px] font-semibold tracking-[0.1em] text-white">Now</span>}
                </h3>
                <p className="nums text-[13px] text-neutral-600 sm:mt-2">
                    {busy ? 'Adding…' : over ? 'Drop to add here' : PART_HOURS[part]}
                    {walks.length > 0 && !busy && !over && (
                        <span className="sm:block">
                            <span className="sm:hidden"> · </span>
                            {done} of {walks.length} done
                        </span>
                    )}
                </p>
            </header>

            <ul className="divide-y divide-hairline">
                {children}
                <li>
                    <button
                        type="button"
                        onClick={onAdd}
                        className={`flex min-h-12 w-full items-center gap-2.5 text-left ${CAPS} text-neutral-500 transition-colors hover:text-neutral-900 ${
                            children.length === 0 ? 'sm:min-h-[64px]' : ''
                        }`}
                    >
                        <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                        Add {part === 'afternoon' || part === 'evening' ? 'an' : 'a'} {part} walk
                    </button>
                </li>
            </ul>
        </section>
    )
}

/**
 * One walk as a timetable line: start over finish, the name and what it adds
 * up to, then a square tick and remove on the right.
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
    const facts = [e ? formatWalkKm(e.distanceM) : null, e ? `${fmt(e.steps)} steps` : null, walk.route ? null : 'No route yet']
        .filter(Boolean)
        .join(' · ')
    return (
        <li className="group flex items-stretch">
            <button type="button" className="flex min-w-0 flex-1 items-start gap-5 py-4 text-left" onClick={() => onOpen(walk)}>
                <span className={`nums w-12 shrink-0 pt-0.5 ${done ? 'text-neutral-400' : 'text-neutral-900'}`}>
                    <span className="block text-[17px] leading-5 tracking-[-0.01em]">{e ? Math.round(e.minutes) : '—'}</span>
                    {e && <span className="mt-1 block text-[12px] leading-4 text-neutral-500">min</span>}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2.5">
                        <span
                            className={`truncate text-[19px] leading-6 tracking-[-0.015em] group-hover:underline group-hover:decoration-neutral-300 group-hover:underline-offset-4 ${
                                done ? 'text-neutral-400 line-through decoration-neutral-300' : 'text-neutral-950'
                            }`}
                        >
                            {title}
                        </span>
                        {walk.series && <i className="fa-solid fa-repeat shrink-0 text-[11px] text-neutral-400" aria-label="Repeats" />}
                        {isNext && !done && (
                            <span className="shrink-0 bg-neutral-900 px-1.5 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-white">Next</span>
                        )}
                    </span>
                    {facts && <span className={`nums mt-1 block truncate text-[13px] ${done ? 'text-neutral-400' : 'text-neutral-600'}`}>{facts}</span>}
                </span>
            </button>
            <div className="flex shrink-0 items-start pt-2.5">
                <button
                    type="button"
                    aria-pressed={done}
                    aria-label={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
                    title={done ? 'Mark as not done' : 'Mark as done'}
                    onClick={() => onToggle(walk)}
                    className="grid h-11 w-11 place-items-center"
                >
                    {done ? (
                        <DoneTick size={18} />
                    ) : (
                        <span
                            className={`block h-[18px] w-[18px] border transition-colors hover:border-neutral-900 ${isNext ? 'border-neutral-900' : 'border-neutral-900/35'}`}
                        />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => onRemove(walk)}
                    aria-label={`Remove ${title}`}
                    title="Remove from this day"
                    className="-mr-3 grid h-11 w-11 place-items-center text-[12px] text-neutral-300 transition-colors hover:text-neutral-900 focus-visible:text-neutral-900"
                >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
            </div>
        </li>
    )
}
