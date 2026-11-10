import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import DropdownMenu from '../components/DropdownMenu'
import Alert from '../components/Alert'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import DayStrip from '../components/timebox/DayStrip'
import DayAgenda from '../components/timebox/DayAgenda'
import TimeboxDrawer, { type TimeboxDraft } from '../components/timebox/TimeboxDrawer'
import TimeboxImportDrawer from '../components/timebox/TimeboxImportDrawer'
import MeetingsFeedDrawer from '../components/timebox/MeetingsFeedDrawer'
import { syncMeetingsFeed, type MeetingsFeed } from '../services/ical'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { todayKey } from '../lib/calendar'
import { formatDuration, minutesToTime, timeToMinutes } from '../lib/time'
import {
    agendaRows,
    boxedMinutes,
    dayBounds,
    nowOrNext,
    planSuggestions,
    unboxedWorkMinutes,
    workWindow,
    type PlanSuggestion,
} from '../lib/timebox'
import {
    createTimebox,
    deleteTimebox,
    listTimeboxes,
    skipTimeboxDay,
    updateTimebox,
    type TimeboxInput,
} from '../services/timeboxes'
import { listPlanEntries as listFitnessPlan } from '../services/fitnessPlan'
import { listPlanEntries as listMealPlan } from '../services/mealPlan'
import type { FitnessPlanEntry, MealPlanEntry, Timebox as TimeboxItem } from '../types'

const nowMinutes = () => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
}

/** Timebox: plan one day block by block, with the day's training and meals to hand. */
export default function Timebox() {
    const { user } = useAuth()
    const toast = useToast()
    const navigate = useNavigate()
    const [date, setDate] = useState(todayKey)
    const [items, setItems] = useState<TimeboxItem[] | null>(null)
    const [fitness, setFitness] = useState<FitnessPlanEntry[]>([])
    const [meals, setMeals] = useState<MealPlanEntry[]>([])
    const [failed, setFailed] = useState(false)
    const [version, setVersion] = useState(0)

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editing, setEditing] = useState<TimeboxItem | null>(null)
    const [draft, setDraft] = useState<TimeboxDraft>({ title: '', startTime: '09:00', endTime: '10:00' })
    const [importOpen, setImportOpen] = useState(false)
    const [meetingsOpen, setMeetingsOpen] = useState(false)
    const [meetingsFeed, setMeetingsFeed] = useState<MeetingsFeed | null>(null)

    const [now, setNow] = useState(nowMinutes)
    useEffect(() => {
        const id = setInterval(() => setNow(nowMinutes()), 60_000)
        return () => clearInterval(id)
    }, [])

    const reload = useCallback(() => setVersion((v) => v + 1), [])

    // Google meetings: a quiet sync on open. The server skips it when the last
    // attempt was under 15 minutes ago, so reopening the page costs nothing.
    useEffect(() => {
        let live = true
        syncMeetingsFeed(true)
            .then(({ status, synced }) => {
                if (!live) return
                setMeetingsFeed(status)
                if (synced) reload()
            })
            .catch(() => {
                /* no feed or offline — Timebox works without it */
            })
        return () => {
            live = false
        }
    }, [reload])

    useEffect(() => {
        let live = true
        listTimeboxes(date)
            .then((list) => {
                if (!live) return
                setItems(list)
                setFailed(false)
            })
            .catch(() => {
                if (!live) return
                setItems([])
                setFailed(true)
            })
        // The plans are a bonus — a failure there just leaves the side list empty.
        Promise.all([listFitnessPlan(date, date).catch(() => []), listMealPlan(date, date).catch(() => [])]).then(
            ([f, m]) => {
                if (!live) return
                setFitness(f)
                setMeals(m)
            }
        )
        return () => {
            live = false
        }
    }, [date, version])

    // Clear the old day's blocks while the next one loads.
    function changeDate(d: string) {
        setItems(null)
        setDate(d)
    }

    const isToday = date === todayKey()
    const list = useMemo(() => items ?? [], [items])
    const work = workWindow(date, user?.settings)
    const bounds = dayBounds(user?.settings?.wakeTime, user?.settings?.bedTime, list, work)
    const boxed = boxedMinutes(list, bounds.start, bounds.end)
    const working = unboxedWorkMinutes(list, work)
    const free = bounds.end - bounds.start - boxed - working
    const current = isToday ? nowOrNext(list, now) : null
    const lunch = work?.lunch
    const suggestions = useMemo(
        () => planSuggestions(fitness, meals, list, lunch),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fitness, meals, list, lunch?.start, lunch?.end]
    )
    const rows = agendaRows(list, suggestions, bounds, work)

    function openNew(next: Partial<TimeboxDraft> & { startTime: string; endTime: string }) {
        setEditing(null)
        setDraft({ title: '', ...next })
        setDrawerOpen(true)
    }

    function addAt(startMin: number) {
        openNew({ startTime: minutesToTime(startMin), endTime: minutesToTime(Math.min(startMin + 60, 24 * 60 - 1)) })
    }

    /** Fill a free gap: an hour from its start, or the whole gap when it's shorter. */
    function fillGap(start: number, end: number) {
        openNew({ startTime: minutesToTime(start), endTime: minutesToTime(Math.min(end, start + 60)) })
    }

    /** Box a task inside working hours: an hour from its start, filed under Work. */
    function fillWork(start: number, end: number) {
        openNew({ startTime: minutesToTime(start), endTime: minutesToTime(Math.min(end, start + 60)), category: 'work' })
    }

    function fillLunch(start: number, end: number) {
        openNew({ title: 'Lunch', startTime: minutesToTime(start), endTime: minutesToTime(end), category: 'health' })
    }

    function openBlock(item: TimeboxItem) {
        setEditing(item)
        setDrawerOpen(true)
    }

    function addNext() {
        // Start at the end of the last block, or the next half hour on today.
        const last = [...list].sort((a, b) => b.endTime.localeCompare(a.endTime))[0]
        const from = last ? timeToMinutes(last.endTime) : isToday ? Math.ceil(now / 30) * 30 : 9 * 60
        addAt(Math.min(Math.max(from, bounds.start), 23 * 60))
    }

    function addSuggestion(s: PlanSuggestion) {
        openNew({ title: s.title, startTime: s.startTime, endTime: s.endTime, category: s.category })
    }

    async function save(input: TimeboxInput) {
        if (editing) await updateTimebox(editing._id, input)
        else await createTimebox(input)
        setDrawerOpen(false)
        reload()
    }

    async function remove(scope: 'this' | 'all') {
        if (!editing) return
        try {
            if (scope === 'this') await skipTimeboxDay(editing._id, date)
            else await deleteTimebox(editing._id)
            setDrawerOpen(false)
            reload()
        } catch {
            toast.error('Couldn’t delete that block.')
        }
    }

    return (
        <Container as="main" className="py-8 sm:py-10">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
                <div className="min-w-0">
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                        Timebox
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">Give every hour of the day a job.</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                    <DashboardDateNav date={date} onChange={changeDate} />
                    <div className="flex w-full gap-2 sm:w-auto">
                        <Button icon="fa-solid fa-plus" onClick={addNext} className="flex-1 sm:flex-none">
                            Add block
                        </Button>
                        <DropdownMenu
                            align="right"
                            trigger={
                                <span
                                    aria-label="More"
                                    className="grid h-11 w-11 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900"
                                >
                                    <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                                </span>
                            }
                            items={[
                                { label: 'Import blocks', icon: 'fa-solid fa-file-import', onClick: () => setImportOpen(true) },
                                { label: 'Google meetings', icon: 'fa-solid fa-video', onClick: () => setMeetingsOpen(true) },
                                { label: 'Working hours', icon: 'fa-solid fa-briefcase', onClick: () => navigate('/profile') },
                            ]}
                        />
                    </div>
                </div>
            </header>

            {failed && (
                <Alert variant="danger" className="mb-5">
                    Couldn’t load this day’s blocks. Please try again shortly.
                </Alert>
            )}

            {items === null ? (
                <div className="grid place-items-center py-24">
                    <Spinner />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-4">
                        <Summary current={current} boxed={boxed} working={working} free={free} count={list.length} />
                        <DayStrip items={list} bounds={bounds} work={work} nowMin={isToday ? now : null} onOpen={openBlock} />
                    </div>
                    <DayAgenda
                        rows={rows}
                        nowMin={isToday ? now : null}
                        onOpen={openBlock}
                        onFill={fillGap}
                        onWork={fillWork}
                        onLunch={fillLunch}
                        onPlan={addSuggestion}
                    />
                </div>
            )}

            <TimeboxDrawer
                open={drawerOpen}
                date={date}
                editing={editing}
                draft={draft}
                onClose={() => setDrawerOpen(false)}
                onSave={save}
                onDelete={remove}
            />
            <TimeboxImportDrawer
                open={importOpen}
                date={date}
                onClose={() => setImportOpen(false)}
                onImported={reload}
            />
            <MeetingsFeedDrawer
                open={meetingsOpen}
                onClose={() => setMeetingsOpen(false)}
                feed={meetingsFeed}
                onChanged={(feed) => {
                    setMeetingsFeed(feed)
                    reload()
                }}
            />
        </Container>
    )
}

/** One plain line: what's on now (or next), then boxed and free time. */
function Summary({
    current,
    boxed,
    working,
    free,
    count,
}: {
    current: { item: TimeboxItem; running: boolean } | null
    boxed: number
    working: number
    free: number
    count: number
}) {
    const lead = current
        ? current.running
            ? { label: 'Now', text: current.item.title, sub: `until ${current.item.endTime}` }
            : { label: 'Next', text: current.item.title, sub: `at ${current.item.startTime}` }
        : { label: count ? 'Done' : 'Empty', text: count ? 'Nothing else today' : 'Nothing boxed yet', sub: '' }
    return (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="min-w-0 text-[17px] text-neutral-900">
                <span className="font-medium text-neutral-500">{lead.label} </span>
                <span className="font-semibold">{lead.text}</span>
                {lead.sub && <span className="text-neutral-500"> {lead.sub}</span>}
            </p>
            <p className="ml-auto text-sm nums text-neutral-500">
                <span className="font-semibold text-neutral-900">{formatDuration(boxed)}</span> boxed ·{' '}
                {working > 0 && (
                    <>
                        <span className="font-semibold text-neutral-900">{formatDuration(working)}</span> work ·{' '}
                    </>
                )}
                <span className="font-semibold text-neutral-900">{formatDuration(Math.max(0, free))}</span> free
            </p>
        </div>
    )
}
