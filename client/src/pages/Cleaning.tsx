import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Container from '../components/Container'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import DropdownMenu from '../components/DropdownMenu'
import ConfirmModal from '../components/ConfirmModal'
import CleaningWizard, { type WizardStep } from '../components/cleaning/CleaningWizard'
import WeekGrid from '../components/cleaning/WeekGrid'
import RoomDrawer from '../components/cleaning/RoomDrawer'
import TimeboxSendDrawer from '../components/cleaning/TimeboxSendDrawer'
import { useToast } from '../context/ToastContext'
import { getCleaningHome, saveCleaningHome, sendCleaningToTimebox } from '../services/cleaning'
import { MONTHS, addDays, todayKey } from '../lib/calendar'
import { formatDuration } from '../lib/time'
import {
    buildSchedule,
    cycleWeekOf,
    dailyMinutes,
    SAFETY_NOTES,
    dayFor,
    mondayOf,
    roomIcon,
    roomWeeklyMinutes,
    WEEK_ORDER,
} from '../lib/cleaning'
import type { CleaningHome, CleaningRoom } from '../types'

/** Cleaning: map the home room by room, then clean it a little each day. */
export default function Cleaning() {
    const toast = useToast()
    const [home, setHome] = useState<CleaningHome | null | undefined>(undefined)
    const [failed, setFailed] = useState(false)
    const [wizard, setWizard] = useState<WizardStep | null>(null)
    const [roomOpen, setRoomOpen] = useState(false)
    const [editingRoom, setEditingRoom] = useState<CleaningRoom | null>(null)
    const [sendOpen, setSendOpen] = useState(false)
    const [ahead, setAhead] = useState(0)
    const [removing, setRemoving] = useState<CleaningRoom | null>(null)

    useEffect(() => {
        let live = true
        getCleaningHome()
            .then((h) => {
                if (live) setHome(h)
            })
            .catch(() => {
                if (!live) return
                setFailed(true)
                setHome(null)
            })
        return () => {
            live = false
        }
    }, [])

    const today = todayKey()
    const schedule = useMemo(
        () => (home ? buildSchedule(home.rooms, { minutesPerDay: home.minutesPerDay, days: home.days }) : null),
        [home]
    )

    async function persist(next: CleaningHome, message?: string) {
        const before = home
        setHome(next)
        try {
            const saved = await saveCleaningHome(next)
            setHome(saved)
            if (message) toast.show(message, 'success')
        } catch {
            setHome(before)
            toast.error('Couldn’t save — please try again.')
            throw new Error('save failed')
        }
    }

    if (home === undefined) {
        return (
            <Container as="main" className="grid place-items-center py-24">
                <Spinner />
            </Container>
        )
    }

    const header = (sub: string, actions?: ReactNode) => (
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
            <div className="min-w-0">
                <h1 className="text-[34px] font-medium leading-[1.1] tracking-[-0.045em] text-neutral-950 sm:text-[44px]">Cleaning</h1>
                <p className="mt-2 max-w-2xl text-[18px] leading-[26px] tracking-[-0.01em] text-neutral-600">{sub}</p>
            </div>
            {actions}
        </header>
    )

    if (!home || wizard) {
        return (
            <Container as="main" className="py-8 sm:py-10">
                {header(home ? 'Change your home, its jobs or your time.' : 'Map your home, then get a week that fits the time you have.')}
                {failed && (
                    <Alert variant="danger" className="mb-5">
                        Couldn’t load your home. Please try again shortly.
                    </Alert>
                )}
                <CleaningWizard
                    initial={home}
                    startStep={wizard ?? 'rooms'}
                    onCancel={home ? () => setWizard(null) : undefined}
                    onSave={async (next) => {
                        try {
                            await persist(next, 'Cleaning schedule saved.')
                            setWizard(null)
                            setAhead(0)
                        } catch {
                            /* toast already shown */
                        }
                    }}
                />
            </Container>
        )
    }

    const sched = schedule!
    const cycle = sched.weeks.length
    const thisWeek = cycleWeekOf(today, home.cycleStart, cycle)
    const week = (thisWeek + ahead) % cycle
    const shownWeek = sched.weeks[week] ?? []
    const overThisWeek = shownWeek.filter((d) => d.total > d.capacity).length
    const monday = addDays(mondayOf(today), ahead * 7)
    const dates: Record<number, string> = {}
    WEEK_ORDER.forEach((dow, i) => (dates[dow] = addDays(monday, i)))
    const todayDay = dayFor(sched, today, home.cycleStart)
    const jobs = home.rooms.reduce((n, r) => n + r.tasks.length, 0)
    const dailyNeed = dailyMinutes(home.rooms)
    const weekNeed = home.rooms.reduce((sum, r) => sum + roomWeeklyMinutes(r, home.days.length), 0)

    function saveRoom(room: CleaningRoom) {
        const exists = home!.rooms.some((r) => r.key === room.key)
        const rooms = exists ? home!.rooms.map((r) => (r.key === room.key ? room : r)) : [...home!.rooms, room]
        persist({ ...home!, rooms }, exists ? 'Room saved.' : `${room.name} added.`)
            .then(() => setRoomOpen(false))
            .catch(() => {})
    }

    function deleteRoom(room: CleaningRoom) {
        setRemoving(null)
        persist({ ...home!, rooms: home!.rooms.filter((r) => r.key !== room.key) }, `${room.name} removed.`)
            .then(() => setRoomOpen(false))
            .catch(() => {})
    }

    async function sendToTimebox(from: string, to: string, startTime: string, blocks: Parameters<typeof sendCleaningToTimebox>[2]) {
        try {
            const res = await sendCleaningToTimebox(from, to, blocks)
            if (startTime !== home!.startTime) persist({ ...home!, startTime }).catch(() => {})
            toast.show(
                `Added ${res.added} cleaning ${res.added === 1 ? 'block' : 'blocks'} to Timebox${res.replaced ? ` (replaced ${res.replaced})` : ''}.`,
                'success'
            )
            setSendOpen(false)
        } catch {
            toast.error('Couldn’t add to Timebox — please try again.')
        }
    }

    return (
        <Container as="main" className="py-8 sm:py-10">
            {header(
                'A little each day, so it never piles up.',
                <div className="flex w-full gap-2 sm:w-auto">
                    <Button icon="fa-solid fa-table-list" onClick={() => setSendOpen(true)} className="flex-1 sm:flex-none">
                        Add to Timebox
                    </Button>
                    <Button variant="secondary" icon="fa-solid fa-pen" onClick={() => setWizard('rooms')} className="flex-1 sm:flex-none">
                        Edit home
                    </Button>
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
                            { label: 'Change time a day', icon: 'fa-solid fa-clock', onClick: () => setWizard('time') },
                            { label: 'Edit jobs room by room', icon: 'fa-solid fa-list-check', onClick: () => setWizard('jobs') },
                        ]}
                    />
                </div>
            )}

            <div className="flex flex-col gap-10">
                <section
                    aria-label="Overview"
                    className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-hairline py-5 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
                >
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                        <p className="text-[12px] text-neutral-600">Today</p>
                        <p className="mt-1 truncate text-[26px] leading-tight tracking-[-0.04em] text-neutral-950 sm:text-[28px]">
                            {todayDay?.items.length ? `${formatDuration(todayDay.total)} of cleaning` : 'A day off'}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                            {todayDay?.items.length
                                ? `${todayDay.items.length} ${todayDay.items.length === 1 ? 'job' : 'jobs'} · ${[
                                      ...new Set(todayDay.items.map((i) => i.roomName)),
                                  ].join(', ')}`
                                : 'Nothing on the list today'}
                        </p>
                    </div>
                    <Figure label="A day" value={formatDuration(home.minutesPerDay)} sub={`${home.days.length} days a week`} />
                    <Figure label="A week" value={formatDuration(Math.round(weekNeed))} sub="of jobs, on average" />
                    <Figure label="Home" value={`${home.rooms.length} rooms`} sub={`${jobs} jobs`} />
                </section>

                <section className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-[20px] font-medium tracking-[-0.02em] text-neutral-950">
                                {ahead === 0 ? 'This week' : ahead === 1 ? 'Next week' : `In ${ahead} weeks`}
                            </h2>
                            <p className="text-[12px] nums text-neutral-500">{weekRange(monday)}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {ahead > 0 && (
                                <Button variant="ghost" size="sm" onClick={() => setAhead(0)}>
                                    This week
                                </Button>
                            )}
                            <button
                                type="button"
                                onClick={() => setAhead((a) => Math.max(0, a - 1))}
                                disabled={ahead === 0}
                                aria-label="Previous week"
                                className="grid h-11 w-11 place-items-center rounded-lg border border-neutral-300 text-neutral-900 transition-colors hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 lg:h-10 lg:w-10"
                            >
                                <i className="fa-solid fa-chevron-left text-[12px]" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setAhead((a) => Math.min(52, a + 1))}
                                disabled={ahead >= 52}
                                aria-label="Next week"
                                className="grid h-11 w-11 place-items-center rounded-lg border border-neutral-300 text-neutral-900 transition-colors hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 lg:h-10 lg:w-10"
                            >
                                <i className="fa-solid fa-chevron-right text-[12px]" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    {(sched.splitJobs > 0 || overThisWeek > 0) && (
                        <p className="-mt-1 text-[13px] text-neutral-600">
                            {sched.splitJobs > 0 &&
                                `${sched.splitJobs} ${sched.splitJobs === 1 ? 'job is' : 'jobs are'} split into parts to fit your ${formatDuration(home.minutesPerDay)}. `}
                            {overThisWeek > 0 && (
                                <span className="text-amber-700">
                                    {overThisWeek} {overThisWeek === 1 ? 'day runs' : 'days run'} over this week
                                    {dailyNeed > home.minutesPerDay
                                        ? ` — the daily jobs alone take ${formatDuration(dailyNeed)}, more than your ${formatDuration(home.minutesPerDay)}.`
                                        : ' — more time a day, or fewer jobs, would fix it.'}
                                </span>
                            )}
                        </p>
                    )}
                    <WeekGrid week={shownWeek} dates={dates} today={today} />
                </section>

                <section className="flex flex-col gap-4">
                    <h2 className="text-[20px] font-medium tracking-[-0.02em] text-neutral-950">Your home</h2>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                        {home.rooms.map((room) => (
                            <button
                                key={room.key}
                                type="button"
                                onClick={() => {
                                    setEditingRoom(room)
                                    setRoomOpen(true)
                                }}
                                className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-neutral-900/[0.06] transition-shadow hover:ring-neutral-900/[0.14]"
                            >
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-area-cleaning-bg text-area-cleaning">
                                    <i className={`fa-solid ${roomIcon(room.kind)}`} aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-medium text-neutral-900">{room.name}</span>
                                    <span className="block truncate text-[12px] nums text-neutral-500">
                                        {room.tasks.length} {room.tasks.length === 1 ? 'job' : 'jobs'} ·{' '}
                                        {formatDuration(Math.round(roomWeeklyMinutes(room, home.days.length)))} a week
                                    </span>
                                </span>
                                <i className="fa-solid fa-chevron-right text-[11px] text-neutral-300" aria-hidden="true" />
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setEditingRoom(null)
                                setRoomOpen(true)
                            }}
                            className="flex items-center gap-3 rounded-2xl border border-dashed border-hairline p-3 text-left text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white hover:text-neutral-900"
                        >
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100">
                                <i className="fa-solid fa-plus" aria-hidden="true" />
                            </span>
                            <span className="text-[14px] font-medium">Add a room</span>
                        </button>
                    </div>
                </section>

                <details className="group border-t border-hairline pt-5">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-medium text-neutral-900">
                        <i className="fa-solid fa-triangle-exclamation text-[13px] text-amber-600" aria-hidden="true" />
                        Safety notes
                        <i className="fa-solid fa-chevron-down ml-1 text-[11px] text-neutral-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-[13px] leading-snug text-neutral-700 lg:grid-cols-2">
                        {SAFETY_NOTES.map((note) => (
                            <li key={note} className="flex gap-2">
                                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                                {note}
                            </li>
                        ))}
                    </ul>
                </details>
            </div>

            <RoomDrawer
                open={roomOpen}
                room={editingRoom}
                takenNames={home.rooms.map((r) => r.name)}
                onClose={() => setRoomOpen(false)}
                onSave={saveRoom}
                onDelete={(key) => setRemoving(home.rooms.find((r) => r.key === key) ?? null)}
            />
            <ConfirmModal
                open={!!removing}
                title="Remove room?"
                message={removing ? `${removing.name} and its ${removing.tasks.length} jobs come off the schedule.` : ''}
                confirmLabel="Remove"
                danger
                onConfirm={() => removing && deleteRoom(removing)}
                onClose={() => setRemoving(null)}
            />
            <TimeboxSendDrawer
                open={sendOpen}
                home={home}
                schedule={sched}
                onClose={() => setSendOpen(false)}
                onSend={sendToTimebox}
            />
        </Container>
    )
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[12px] text-neutral-600">{label}</p>
            <p className="mt-1 truncate text-[26px] leading-tight tracking-[-0.045em] nums text-neutral-950 sm:text-[28px]">{value}</p>
            <p className="mt-0.5 truncate text-[12px] text-neutral-500">{sub}</p>
        </div>
    )
}

/** "17 – 23 Nov" (or across months, "29 Dec – 4 Jan"). */
function weekRange(monday: string) {
    const sunday = addDays(monday, 6)
    const [, m1, d1] = monday.split('-').map(Number)
    const [, m2, d2] = sunday.split('-').map(Number)
    const mon = (m: number) => MONTHS[m - 1].slice(0, 3)
    return m1 === m2 ? `${d1} – ${d2} ${mon(m2)}` : `${d1} ${mon(m1)} – ${d2} ${mon(m2)}`
}
