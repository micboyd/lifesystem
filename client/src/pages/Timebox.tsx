import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Container from '../components/Container'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import TimeboxEditor from '../components/timebox/TimeboxEditor'
import {
    listTimeboxes,
    createTimebox,
    updateTimebox,
    deleteTimebox,
    type TimeboxInput,
} from '../services/timeboxes'
import { todayKey, formatDateLong } from '../lib/calendar'
import {
    timeToMinutes,
    minutesToTime,
    formatDuration,
    DEFAULT_WAKE,
    DEFAULT_BED,
} from '../lib/time'
import { TIMEBOX_CATEGORY_COLORS, TIMEBOX_DEFAULT_COLORS } from '../types'
import type { Timebox } from '../types'

const PX_PER_MIN = 1 // 60px per hour

export default function Timebox() {
    const { user } = useAuth()
    const { state } = useLocation()
    const [date, setDate] = useState((state as { date?: string } | null)?.date ?? todayKey())
    const [items, setItems] = useState<Timebox[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date

    const [editorOpen, setEditorOpen] = useState(false)
    const [editing, setEditing] = useState<Timebox | null>(null)
    const [defaults, setDefaults] = useState({ startTime: '09:00', endTime: '10:00' })
    const [saving, setSaving] = useState(false)
    const [conflict, setConflict] = useState(false)

    // Bounds from settings (fallback to sensible defaults)
    const s = user?.settings ?? {}
    let wake = s.wakeTime ?? DEFAULT_WAKE
    let bed = s.bedTime ?? DEFAULT_BED
    if (timeToMinutes(bed) <= timeToMinutes(wake)) {
        wake = DEFAULT_WAKE
        bed = DEFAULT_BED
    }
    const wakeMin = timeToMinutes(wake)
    const bedMin = timeToMinutes(bed)
    const totalHeight = (bedMin - wakeMin) * PX_PER_MIN

    const workStart = s.workStart
    const workEnd = s.workEnd

    // ── Current-time indicator ────────────────────────────────────────────────
    const [nowMin, setNowMin] = useState(() => {
        const n = new Date()
        return n.getHours() * 60 + n.getMinutes()
    })
    useEffect(() => {
        const tick = () => {
            const n = new Date()
            setNowMin(n.getHours() * 60 + n.getMinutes())
        }
        const id = setInterval(tick, 60_000)
        return () => clearInterval(id)
    }, [])
    const showNow = date === todayKey() && nowMin >= wakeMin && nowMin <= bedMin
    const nowTop = (nowMin - wakeMin) * PX_PER_MIN

    useEffect(() => {
        let active = true
        listTimeboxes(date, date)
            .then((list) => active && setItems(list))
            .catch(() => active && setItems([]))
            .finally(() => {
                if (active) setLoadedDate(date)
            })
        return () => {
            active = false
        }
    }, [date])

    const hourLines = useMemo(() => {
        const lines: number[] = []
        for (let m = Math.ceil(wakeMin / 60) * 60; m <= bedMin; m += 60) lines.push(m)
        return lines
    }, [wakeMin, bedMin])

    async function reload() {
        setItems(await listTimeboxes(date, date))
    }

    function openNew(startMin: number) {
        const start = Math.max(wakeMin, Math.min(bedMin - 30, Math.round(startMin / 15) * 15))
        setDefaults({
            startTime: minutesToTime(start),
            endTime: minutesToTime(Math.min(bedMin, start + 60)),
        })
        setEditing(null)
        setConflict(false)
        setEditorOpen(true)
    }

    function openEdit(item: Timebox) {
        setEditing(item)
        setConflict(false)
        setEditorOpen(true)
    }

    function handleBackgroundClick(e: MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const y = e.clientY - rect.top
        openNew(wakeMin + y / PX_PER_MIN)
    }

    async function handleSave(input: TimeboxInput) {
        setSaving(true)
        setConflict(false)
        try {
            if (editing) await updateTimebox(editing._id, input)
            else await createTimebox(date, input)
            await reload()
            setEditorOpen(false)
            setEditing(null)
        } catch (err: unknown) {
            if ((err as { response?: { status?: number } })?.response?.status === 409)
                setConflict(true)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!editing) return
        setSaving(true)
        try {
            await deleteTimebox(editing._id)
            await reload()
            setEditorOpen(false)
            setEditing(null)
        } finally {
            setSaving(false)
        }
    }

    const plannedMin = items.reduce(
        (sum, i) => sum + (timeToMinutes(i.endTime) - timeToMinutes(i.startTime)),
        0
    )
    const dayMin = bedMin - wakeMin

    return (
        <Container as="main" className="py-10">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Timebox</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {formatDateLong(date)} · plan your day
                    </p>
                </div>
                <DashboardDateNav date={date} onChange={setDate} />
            </header>

            {/* Summary bar */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                    <Badge variant="outline" className="bg-white">
                        <i className="fa-regular fa-clock text-neutral-400" aria-hidden="true" />
                        {wake} – {bed}
                    </Badge>
                    {workStart && workEnd && (
                        <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-700"
                        >
                            <i className="fa-solid fa-briefcase text-blue-400" aria-hidden="true" />
                            Work {workStart} – {workEnd}
                        </Badge>
                    )}
                    <Badge variant="outline" className="bg-white">
                        {items.length} {items.length === 1 ? 'block' : 'blocks'}
                    </Badge>
                    {plannedMin > 0 && (
                        <Badge variant="success">
                            <i className="fa-solid fa-layer-group" aria-hidden="true" />
                            {formatDuration(plannedMin)} planned
                        </Badge>
                    )}
                    {plannedMin > 0 && dayMin > plannedMin && (
                        <Badge variant="outline" className="bg-white text-neutral-500">
                            {formatDuration(dayMin - plannedMin)} free
                        </Badge>
                    )}
                </div>
                <Button
                    icon="fa-solid fa-plus"
                    onClick={() => openNew(workStart ? timeToMinutes(workStart) : wakeMin + 120)}
                >
                    Add block
                </Button>
            </div>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : (
                <div>
                    <div className="relative flex">
                        {/* Hour labels */}
                        <div className="relative w-14 shrink-0" style={{ height: totalHeight }}>
                            {hourLines.map((m) => (
                                <span
                                    key={m}
                                    className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-neutral-400"
                                    style={{ top: (m - wakeMin) * PX_PER_MIN }}
                                >
                                    {minutesToTime(m)}
                                </span>
                            ))}
                        </div>

                        {/* Timeline */}
                        <div
                            onClick={handleBackgroundClick}
                            className="relative flex-1 cursor-copy rounded-lg border-l border-neutral-100"
                            style={{ height: totalHeight }}
                        >
                            {/* Working hours band */}
                            {workStart &&
                                workEnd &&
                                timeToMinutes(workEnd) > timeToMinutes(workStart) && (
                                    <div
                                        className="absolute inset-x-0 bg-blue-50"
                                        style={{
                                            top: (timeToMinutes(workStart) - wakeMin) * PX_PER_MIN,
                                            height:
                                                (timeToMinutes(workEnd) -
                                                    timeToMinutes(workStart)) *
                                                PX_PER_MIN,
                                        }}
                                    >
                                        <span className="absolute right-2 top-1 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
                                            Working hours
                                        </span>
                                    </div>
                                )}

                            {/* Hour gridlines */}
                            {hourLines.map((m) => (
                                <div
                                    key={m}
                                    className="absolute inset-x-0 border-t border-neutral-100"
                                    style={{ top: (m - wakeMin) * PX_PER_MIN }}
                                />
                            ))}

                            {/* Now indicator */}
                            {showNow && (
                                <div
                                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                                    style={{ top: nowTop }}
                                >
                                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                                    <div className="h-px flex-1 bg-rose-400/50" />
                                </div>
                            )}

                            {/* Items */}
                            {items.map((item) => {
                                const top = (timeToMinutes(item.startTime) - wakeMin) * PX_PER_MIN
                                const height = Math.max(
                                    22,
                                    (timeToMinutes(item.endTime) - timeToMinutes(item.startTime)) *
                                        PX_PER_MIN
                                )
                                const dur = formatDuration(
                                    timeToMinutes(item.endTime) - timeToMinutes(item.startTime)
                                )
                                const compact = height < 44
                                const c = item.category
                                    ? TIMEBOX_CATEGORY_COLORS[item.category]
                                    : TIMEBOX_DEFAULT_COLORS
                                return (
                                    <button
                                        key={item._id}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            openEdit(item)
                                        }}
                                        className={`absolute left-1.5 right-1.5 flex flex-col items-center justify-center overflow-hidden rounded-lg border px-2 py-1 text-center transition-opacity hover:opacity-75 ${c.bg} ${c.border}`}
                                        style={{ top, height }}
                                    >
                                        <div
                                            className={`w-full ${compact ? 'flex items-center justify-center gap-2' : ''}`}
                                        >
                                            <span
                                                className={`block truncate text-xs font-semibold leading-tight ${c.text}`}
                                            >
                                                {item.title}
                                            </span>
                                            <span
                                                className={`${compact ? '' : 'mt-0.5 block'} truncate text-[10px] font-medium ${c.sub}`}
                                            >
                                                {item.startTime} – {item.endTime} · {dur}
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {items.length === 0 && (
                        <p className="mt-3 text-center text-xs text-neutral-300">
                            Click anywhere on the timeline to add a block
                        </p>
                    )}
                </div>
            )}

            <TimeboxEditor
                open={editorOpen}
                item={editing}
                defaults={defaults}
                minTime={wake}
                maxTime={bed}
                saving={saving}
                conflict={conflict}
                onClose={() => {
                    setEditorOpen(false)
                    setEditing(null)
                    setConflict(false)
                }}
                onSave={handleSave}
                onDelete={handleDelete}
            />
        </Container>
    )
}
