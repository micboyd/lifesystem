import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
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
import MeetingsFeedDrawer, { syncedAgo } from '../components/timebox/MeetingsFeedDrawer'
import Tooltip from '../components/Tooltip'
import ContextMenu from '../components/ContextMenu'
import type { MenuEntry } from '../components/DropdownMenu'
import { syncMeetingsFeed, type MeetingsFeed } from '../services/ical'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { todayKey } from '../lib/calendar'
import { formatDuration, minutesToTime, timeToMinutes } from '../lib/time'
import {
    agendaRows,
    blockLength,
    boxedMinutes,
    landingFor,
    placeAt,
    dayBounds,
    nowOrNext,
    ownBlocks,
    planSuggestions,
    unboxedWorkMinutes,
    workWindow,
    type AgendaRow,
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
import { listPlanEntries as listMealPlan } from '../services/mealPlan'
import type { MealPlanEntry, Timebox as TimeboxItem } from '../types'

/** A copied block, ready to paste on any day: everything but its time. */
interface Clip {
    title: string
    notes?: string
    category?: TimeboxItem['category']
    length: number
}

const nowMinutes = () => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
}

/** Timebox: plan one day block by block, with the day's meals to hand. */
export default function Timebox() {
    const { user } = useAuth()
    const toast = useToast()
    const navigate = useNavigate()
    const [date, setDate] = useState(todayKey)
    const [items, setItems] = useState<TimeboxItem[] | null>(null)
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
    const [syncing, setSyncing] = useState(false)

    /** Pull the Google feed now, whatever the 15-minute rule says. */
    async function syncNow() {
        if (syncing) return
        setSyncing(true)
        try {
            const { status, synced, result } = await syncMeetingsFeed(false)
            setMeetingsFeed(status)
            if (synced && result) {
                reload()
                const changes = result.added + result.removed
                toast.show(
                    changes
                        ? `Meetings synced: ${result.added} new, ${result.removed} removed.`
                        : 'Meetings are up to date.',
                    'success'
                )
            } else toast.error(status.lastError ?? 'Couldn’t sync meetings.')
        } catch {
            toast.error('Couldn’t sync meetings.')
        } finally {
            setSyncing(false)
        }
    }

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
        // The meal plan is a bonus — a failure there just leaves no suggestions.
        listMealPlan(date, date)
            .catch(() => [])
            .then((m) => {
                if (live) setMeals(m)
            })
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
    // Meetings inside working hours are part of the work, not boxed time of their own.
    const own = ownBlocks(list, work)
    const boxed = boxedMinutes(own, bounds.start, bounds.end)
    const working = unboxedWorkMinutes(own, work)
    const free = bounds.end - bounds.start - boxed - working
    const current = isToday ? nowOrNext(list, now) : null
    const lunch = work?.lunch
    const suggestions = useMemo(
        () => planSuggestions(meals, list, lunch),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [meals, list, lunch?.start, lunch?.end]
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

    // ── Right-click, copy / paste, drag ─────────────────────────────────────
    const [clip, setClip] = useState<Clip | null>(null)
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null)
    const closeMenu = useCallback(() => setMenu(null), [])

    const repeats = (item: TimeboxItem) => !!item.recurrence

    function copy(item: TimeboxItem, quiet = false) {
        setClip({
            title: item.title,
            notes: item.source ? undefined : item.notes,
            category: item.source ? 'work' : item.category,
            length: blockLength(item),
        })
        if (!quiet) toast.show(`Copied “${item.title}”. Right-click a gap or block to paste.`, 'info')
    }

    async function paste(startMin: number) {
        if (!clip) return
        try {
            await createTimebox({
                date,
                title: clip.title,
                notes: clip.notes,
                category: clip.category,
                ...placeAt(startMin, clip.length),
            })
            reload()
        } catch {
            toast.error('Couldn’t paste that block.')
        }
    }

    async function duplicate(item: TimeboxItem) {
        try {
            await createTimebox({
                date,
                title: item.title,
                notes: item.notes,
                category: item.category,
                ...placeAt(timeToMinutes(item.endTime), blockLength(item)),
            })
            reload()
        } catch {
            toast.error('Couldn’t duplicate that block.')
        }
    }

    async function removeBlock(item: TimeboxItem, scope: 'this' | 'all', quiet = false) {
        try {
            if (scope === 'this') await skipTimeboxDay(item._id, date)
            else await deleteTimebox(item._id)
            reload()
            if (!quiet) toast.show(`Deleted “${item.title}”${scope === 'this' && repeats(item) ? ' for this day' : ''}.`, 'success')
        } catch {
            toast.error('Couldn’t delete that block.')
        }
    }

    function cut(item: TimeboxItem) {
        copy(item, true)
        void removeBlock(item, repeats(item) ? 'this' : 'all', true)
        toast.show(`Cut “${item.title}”. Right-click a gap or block to paste.`, 'info')
    }

    /**
     * Moves a block of your own to start at `startMin`, keeping its length. A
     * repeat moves for this day only: the day is skipped in the series and a
     * one-off takes its place.
     */
    async function moveBlock(item: TimeboxItem, startMin: number) {
        if (item.source) return
        const times = placeAt(startMin, blockLength(item))
        if (times.startTime === item.startTime) return
        // Show it in its new place straight away.
        setItems((prev) => prev?.map((i) => (i === item ? { ...i, ...times } : i)) ?? prev)
        const input: TimeboxInput = { date, title: item.title, notes: item.notes, category: item.category, ...times }
        try {
            if (repeats(item)) {
                await skipTimeboxDay(item._id, date)
                await createTimebox(input)
                toast.show(`Moved “${item.title}” to ${times.startTime} for this day only.`, 'info')
            } else await updateTimebox(item._id, { ...input, recurrence: null })
        } catch {
            toast.error('Couldn’t move that block.')
        }
        reload()
    }

    function pasteEntry(at: number, label = 'Paste'): MenuEntry[] {
        return clip
            ? [{ label: `${label} “${clip.title}” at ${placeAt(at, clip.length).startTime}`, icon: 'fa-solid fa-paste', onClick: () => paste(at) }]
            : []
    }

    function itemEntries(item: TimeboxItem): MenuEntry[] {
        const end = timeToMinutes(item.endTime)
        if (item.source)
            return [
                { label: 'Open meeting', icon: 'fa-solid fa-up-right-from-square', onClick: () => openBlock(item) },
                ...(item.joinUrl
                    ? [{ label: 'Join call', icon: 'fa-solid fa-video', onClick: () => window.open(item.joinUrl, '_blank', 'noopener,noreferrer') }]
                    : []),
                { label: 'Copy as a block', icon: 'fa-regular fa-copy', onClick: () => copy(item) },
                ...pasteEntry(end),
            ]
        const start = timeToMinutes(item.startTime)
        return [
            { label: 'Edit', icon: 'fa-solid fa-pen', onClick: () => openBlock(item) },
            'divider',
            { label: 'Copy', icon: 'fa-regular fa-copy', onClick: () => copy(item) },
            { label: 'Cut', icon: 'fa-solid fa-scissors', onClick: () => cut(item) },
            { label: 'Duplicate after', icon: 'fa-solid fa-clone', onClick: () => duplicate(item) },
            ...pasteEntry(end),
            'divider',
            { label: '15 min earlier', icon: 'fa-solid fa-arrow-up', onClick: () => moveBlock(item, start - 15) },
            { label: '15 min later', icon: 'fa-solid fa-arrow-down', onClick: () => moveBlock(item, start + 15) },
            'divider',
            ...(repeats(item)
                ? [
                      { label: 'Delete this day', icon: 'fa-solid fa-calendar-xmark', danger: true, onClick: () => removeBlock(item, 'this') },
                      { label: 'Delete every repeat', icon: 'fa-solid fa-trash', danger: true, onClick: () => removeBlock(item, 'all') },
                  ]
                : [{ label: 'Delete', icon: 'fa-solid fa-trash', danger: true, onClick: () => removeBlock(item, 'all') }]),
        ]
    }

    function rowEntries(row: AgendaRow): MenuEntry[] {
        const at = landingFor(row)
        const add: MenuEntry =
            row.kind === 'planned'
                ? { label: `Add “${row.suggestion.title}”`, icon: 'fa-solid fa-plus', onClick: () => addSuggestion(row.suggestion) }
                : row.kind === 'lunch'
                  ? { label: 'Box lunch', icon: 'fa-solid fa-plus', onClick: () => fillLunch(row.start, row.end) }
                  : row.kind === 'work'
                    ? { label: 'New work block here', icon: 'fa-solid fa-plus', onClick: () => fillWork(row.start, row.end) }
                    : { label: 'New block here', icon: 'fa-solid fa-plus', onClick: () => fillGap(row.start, row.end) }
        return [add, ...pasteEntry(at, 'Paste')]
    }

    function openMenu(e: MouseEvent, row: AgendaRow | null, item?: TimeboxItem) {
        const items = item ? itemEntries(item) : row ? rowEntries(row) : []
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, items })
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
                    <h1 className="text-[34px] font-medium leading-[1.1] tracking-[-0.045em] text-neutral-950 sm:text-[44px]">
                        Timebox
                    </h1>
                    <p className="mt-2 max-w-2xl text-[18px] leading-[26px] tracking-[-0.01em] text-neutral-600">Give every hour of the day a job.</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                    <DashboardDateNav date={date} onChange={changeDate} />
                    <div className="flex w-full gap-2 sm:w-auto">
                        <Button icon="fa-solid fa-plus" onClick={addNext} className="flex-1 sm:flex-none">
                            Add block
                        </Button>
                        {meetingsFeed?.connected && (
                            <Tooltip
                                placement="bottom"
                                content={syncing ? 'Syncing…' : `Sync meetings · last ${syncedAgo(meetingsFeed.lastSyncedAt)}`}
                            >
                                <button
                                    type="button"
                                    onClick={syncNow}
                                    disabled={syncing}
                                    aria-label="Sync Google meetings now"
                                    className="grid h-11 w-11 place-items-center rounded-lg border border-neutral-300 text-neutral-900 transition-colors hover:border-neutral-900 disabled:opacity-60 lg:h-10 lg:w-10"
                                >
                                    <i
                                        className={`fa-solid fa-arrows-rotate ${syncing ? 'animate-spin' : ''}`}
                                        aria-hidden="true"
                                    />
                                </button>
                            </Tooltip>
                        )}
                        <DropdownMenu
                            align="right"
                            trigger={
                                <span
                                    aria-label="More"
                                    className="grid h-11 w-11 place-items-center rounded-lg border border-neutral-300 text-neutral-900 transition-colors hover:border-neutral-900 lg:h-10 lg:w-10"
                                >
                                    <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                                </span>
                            }
                            items={[
                                { label: 'Import blocks', icon: 'fa-solid fa-file-import', onClick: () => setImportOpen(true) },
                                ...(meetingsFeed?.connected
                                    ? [{ label: 'Sync meetings now', icon: 'fa-solid fa-arrows-rotate', onClick: syncNow }]
                                    : []),
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
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-5">
                        <Summary current={current} boxed={boxed} working={working} free={free} count={list.length} />
                        <DayStrip
                            items={list}
                            bounds={bounds}
                            work={work}
                            nowMin={isToday ? now : null}
                            onOpen={openBlock}
                            onMove={moveBlock}
                        />
                    </div>
                    <DayAgenda
                        rows={rows}
                        work={work}
                        nowMin={isToday ? now : null}
                        onOpen={openBlock}
                        onFill={fillGap}
                        onWork={fillWork}
                        onOpenMeeting={openBlock}
                        onLunch={fillLunch}
                        onPlan={addSuggestion}
                        onMenu={openMenu}
                        onMove={moveBlock}
                    />
                    <p className="hidden text-[12px] text-neutral-500 md:block">
                        Right-click any row for copy, paste, move and delete · drag a block onto a gap, or
                        along the bar above for exact times
                    </p>
                </div>
            )}

            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}

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

/** The day in a few figures on a hairline band: what's on now (or next), then boxed, work and free time. */
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
            ? { label: 'Now', text: current.item.title, sub: `Until ${current.item.endTime}` }
            : { label: 'Next', text: current.item.title, sub: `At ${current.item.startTime}` }
        : { label: count ? 'Done' : 'Empty', text: count ? 'Nothing else today' : 'Nothing boxed yet', sub: count ? 'The day’s blocks are behind you' : 'Tap a gap below to fill it' }
    return (
        <section
            aria-label="The day"
            className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-hairline py-5 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
        >
            <div className="col-span-2 min-w-0 lg:col-span-1">
                <p className={`text-[12px] ${current?.running ? 'font-medium text-coral-600' : 'text-neutral-600'}`}>{lead.label}</p>
                <p className="mt-1 truncate text-[26px] leading-tight tracking-[-0.04em] text-neutral-950 sm:text-[28px]">
                    {lead.text}
                </p>
                <p className="mt-0.5 truncate text-[12px] nums text-neutral-500">{lead.sub}</p>
            </div>
            <Figure label="Boxed" value={formatDuration(boxed)} sub={`${count} ${count === 1 ? 'block' : 'blocks'}`} />
            {working > 0 && <Figure label="Work" value={formatDuration(working)} sub="Unboxed working hours" />}
            <Figure label="Free" value={formatDuration(Math.max(0, free))} sub="Still to give a job" />
        </section>
    )
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[12px] text-neutral-600">{label}</p>
            <p className="mt-1 truncate text-[26px] leading-tight tracking-[-0.045em] nums text-neutral-950 sm:text-[28px]">
                {value}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-neutral-500">{sub}</p>
        </div>
    )
}
