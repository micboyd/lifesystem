import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent,
    type MouseEvent,
    type PointerEvent,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Container from '../components/Container'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Modal from '../components/Modal'
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
import { listTasks } from '../services/tasks'
import { todayKey, formatDateLong } from '../lib/calendar'
import {
    timeToMinutes,
    minutesToTime,
    formatDuration,
    DEFAULT_WAKE,
    DEFAULT_BED,
} from '../lib/time'
import { TIMEBOX_CATEGORY_COLORS, TIMEBOX_DEFAULT_COLORS } from '../types'
import type { Task, Timebox } from '../types'

const PX_PER_MIN = 2.5 // 150px per hour
const DEFAULT_TASK_DURATION = 60 // minutes, when a dragged task has no estimate

export default function Timebox() {
    const { user } = useAuth()
    const { state } = useLocation()
    const [date, setDate] = useState((state as { date?: string } | null)?.date ?? todayKey())
    const [items, setItems] = useState<Timebox[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date

    const [editorOpen, setEditorOpen] = useState(false)
    const [editing, setEditing] = useState<Timebox | null>(null)
    const [defaults, setDefaults] = useState<{
        startTime: string
        endTime: string
        title?: string
    }>({ startTime: '09:00', endTime: '10:00' })
    const [saving, setSaving] = useState(false)
    const [conflict, setConflict] = useState(false)
    const [deleteScope, setDeleteScope] = useState<'prompt' | null>(null)

    // Tasks that can be dragged onto the timeline
    const [tasks, setTasks] = useState<Task[]>([])
    const dragTaskRef = useRef<Task | null>(null)
    const [dragPreview, setDragPreview] = useState<{ top: number; height: number } | null>(null)

    // Existing blocks being dragged to a new time
    const [blockDrag, setBlockDrag] = useState<{
        id: string
        startMin: number
        valid: boolean
    } | null>(null)
    const blockDragRef = useRef<{
        item: Timebox
        pointerStartY: number
        origStart: number
        durMin: number
        moved: boolean
        lastStart: number
        lastValid: boolean
    } | null>(null)
    const suppressClickRef = useRef(false)

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
    const workDays = s.workDays ?? [1, 2, 3, 4, 5]
    const isWorkingDay = workDays.includes(new Date(`${date}T12:00:00`).getDay())

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

    useEffect(() => {
        let active = true
        listTasks(date, date)
            .then((list) => active && setTasks(list))
            .catch(() => active && setTasks([]))
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

    // ── Drag tasks onto the timeline ─────────────────────────────────────────
    /** Snapped, clamped drop slot for the task currently being dragged. */
    function dropSlot(e: DragEvent<HTMLDivElement>, task: Task) {
        const rect = e.currentTarget.getBoundingClientRect()
        const dur = Math.min(task.duration ?? DEFAULT_TASK_DURATION, bedMin - wakeMin)
        const raw = wakeMin + (e.clientY - rect.top) / PX_PER_MIN
        const start = Math.max(wakeMin, Math.min(bedMin - dur, Math.round(raw / 15) * 15))
        return { start, dur }
    }

    function handleDragOver(e: DragEvent<HTMLDivElement>) {
        const task = dragTaskRef.current
        if (!task) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        const { start, dur } = dropSlot(e, task)
        setDragPreview({ top: (start - wakeMin) * PX_PER_MIN, height: dur * PX_PER_MIN })
    }

    function handleDragLeave(e: DragEvent<HTMLDivElement>) {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragPreview(null)
    }

    async function handleDrop(e: DragEvent<HTMLDivElement>) {
        const task = dragTaskRef.current
        dragTaskRef.current = null
        setDragPreview(null)
        if (!task) return
        e.preventDefault()
        const { start, dur } = dropSlot(e, task)
        const input: TimeboxInput = {
            title: task.title,
            startTime: minutesToTime(start),
            endTime: minutesToTime(start + dur),
        }
        setSaving(true)
        try {
            await createTimebox(date, input)
            await reload()
        } catch (err: unknown) {
            if ((err as { response?: { status?: number } })?.response?.status === 409) {
                // Slot taken — open the editor so a free time can be picked
                setDefaults({ ...input })
                setEditing(null)
                setConflict(true)
                setEditorOpen(true)
            }
        } finally {
            setSaving(false)
        }
    }

    // ── Drag existing blocks to a new time ───────────────────────────────────
    /** True when [startMin, endMin) collides with any other block on the day. */
    function overlapsOther(id: string, startMin: number, endMin: number) {
        return items.some(
            (o) =>
                o._id !== id &&
                timeToMinutes(o.startTime) < endMin &&
                timeToMinutes(o.endTime) > startMin
        )
    }

    function handleBlockPointerDown(e: PointerEvent<HTMLButtonElement>, item: Timebox) {
        // Recurring blocks apply to many days — move those via the editor
        if (item.recurrence || item.isRecurringInstance) return
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const origStart = timeToMinutes(item.startTime)
        blockDragRef.current = {
            item,
            pointerStartY: e.clientY,
            origStart,
            durMin: timeToMinutes(item.endTime) - origStart,
            moved: false,
            lastStart: origStart,
            lastValid: true,
        }
    }

    function handleBlockPointerMove(e: PointerEvent<HTMLButtonElement>) {
        const d = blockDragRef.current
        if (!d) return
        const deltaPx = e.clientY - d.pointerStartY
        // Small threshold so plain clicks still open the editor
        if (!d.moved && Math.abs(deltaPx) < 5) return
        d.moved = true
        const raw = d.origStart + deltaPx / PX_PER_MIN
        const start = Math.max(wakeMin, Math.min(bedMin - d.durMin, Math.round(raw / 15) * 15))
        const valid = !overlapsOther(d.item._id, start, start + d.durMin)
        d.lastStart = start
        d.lastValid = valid
        setBlockDrag({ id: d.item._id, startMin: start, valid })
    }

    async function handleBlockPointerUp() {
        const d = blockDragRef.current
        blockDragRef.current = null
        setBlockDrag(null)
        if (!d || !d.moved) return // plain click → onClick opens the editor
        suppressClickRef.current = true
        if (!d.lastValid || d.lastStart === d.origStart) return // snap back
        const startTime = minutesToTime(d.lastStart)
        const endTime = minutesToTime(d.lastStart + d.durMin)
        // Optimistic move
        setItems((prev) =>
            prev.map((i) => (i._id === d.item._id ? { ...i, startTime, endTime } : i))
        )
        try {
            await updateTimebox(d.item._id, {
                title: d.item.title,
                category: d.item.category,
                startTime,
                endTime,
            })
        } catch {
            await reload() // rejected (e.g. overlap race) — snap back
        }
    }

    function handleBlockPointerCancel() {
        blockDragRef.current = null
        setBlockDrag(null)
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

    function handleDelete() {
        if (!editing) return
        const isRecurring = editing.recurrence != null || editing.isRecurringInstance
        if (isRecurring) {
            setDeleteScope('prompt')
        } else {
            doDelete('all')
        }
    }

    async function doDelete(scope: 'all' | 'this') {
        if (!editing) return
        setSaving(true)
        try {
            await deleteTimebox(editing._id, scope, scope === 'this' ? date : undefined)
            await reload()
            setEditorOpen(false)
            setEditing(null)
            setDeleteScope(null)
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
                    {isWorkingDay && workStart && workEnd && (
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
                <div className="flex flex-col gap-6 lg:flex-row">
                    <div className="min-w-0 flex-1">
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
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className="relative flex-1 cursor-copy rounded-lg border-l border-neutral-100"
                                style={{ height: totalHeight }}
                            >
                                {/* Working hours band */}
                                {isWorkingDay &&
                                    workStart &&
                                    workEnd &&
                                    timeToMinutes(workEnd) > timeToMinutes(workStart) && (
                                        <div
                                            className="absolute inset-x-0 bg-blue-50"
                                            style={{
                                                top:
                                                    (timeToMinutes(workStart) - wakeMin) *
                                                    PX_PER_MIN,
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

                                {/* Drop preview */}
                                {dragPreview && (
                                    <div
                                        className="pointer-events-none absolute left-1.5 right-1.5 z-20 rounded-lg border-2 border-dashed border-neutral-400 bg-neutral-200/60"
                                        style={dragPreview}
                                    />
                                )}

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
                                    const durMin =
                                        timeToMinutes(item.endTime) - timeToMinutes(item.startTime)
                                    const dragging = blockDrag?.id === item._id
                                    const startMin = dragging
                                        ? blockDrag.startMin
                                        : timeToMinutes(item.startTime)
                                    const top = (startMin - wakeMin) * PX_PER_MIN
                                    const height = Math.max(22, durMin * PX_PER_MIN)
                                    const dur = formatDuration(durMin)
                                    const compact = height < 44
                                    const movable = !item.recurrence && !item.isRecurringInstance
                                    const c = item.category
                                        ? TIMEBOX_CATEGORY_COLORS[item.category]
                                        : TIMEBOX_DEFAULT_COLORS
                                    return (
                                        <button
                                            key={item._id}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (suppressClickRef.current) {
                                                    suppressClickRef.current = false
                                                    return
                                                }
                                                openEdit(item)
                                            }}
                                            onPointerDown={(e) => handleBlockPointerDown(e, item)}
                                            onPointerMove={handleBlockPointerMove}
                                            onPointerUp={handleBlockPointerUp}
                                            onPointerCancel={handleBlockPointerCancel}
                                            className={[
                                                'absolute left-1.5 right-1.5 flex flex-col items-center justify-center overflow-hidden rounded-lg border px-2 py-1 text-center',
                                                movable
                                                    ? 'cursor-grab touch-none select-none active:cursor-grabbing'
                                                    : '',
                                                dragging
                                                    ? `z-30 shadow-lg ring-2 ${blockDrag.valid ? 'ring-neutral-400' : 'ring-red-400'}`
                                                    : 'transition-opacity hover:opacity-75',
                                                c.bg,
                                                c.border,
                                            ].join(' ')}
                                            style={{ top, height }}
                                        >
                                            <div
                                                className={`w-full ${compact ? 'flex items-center justify-center gap-2' : ''}`}
                                            >
                                                <span
                                                    className={`block truncate text-xs font-semibold leading-tight ${c.text}`}
                                                >
                                                    {(item.recurrence ||
                                                        item.isRecurringInstance) && (
                                                        <i
                                                            className="fa-solid fa-rotate mr-1 text-[9px] opacity-60"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    {item.title}
                                                </span>
                                                <span
                                                    className={`${compact ? '' : 'mt-0.5 block'} truncate text-[10px] font-medium ${c.sub}`}
                                                >
                                                    {minutesToTime(startMin)} –{' '}
                                                    {minutesToTime(startMin + durMin)} · {dur}
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

                    {/* Task panel */}
                    <aside className="lg:w-64 lg:shrink-0">
                        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 lg:sticky lg:top-6">
                            <h2 className="text-sm font-bold text-neutral-800">Tasks</h2>
                            <p className="mt-0.5 text-xs text-neutral-400">
                                Drag a task onto the timeline to schedule it.
                            </p>
                            <div className="mt-3 flex flex-col gap-1.5">
                                {tasks.filter((t) => !t.completed).length === 0 && (
                                    <p className="py-2 text-center text-xs text-neutral-300">
                                        No open tasks for this day
                                    </p>
                                )}
                                {tasks
                                    .filter((t) => !t.completed)
                                    .map((task) => (
                                        <div
                                            key={task._id}
                                            draggable
                                            onDragStart={(e) => {
                                                dragTaskRef.current = task
                                                e.dataTransfer.effectAllowed = 'copy'
                                                e.dataTransfer.setData('text/plain', task.title)
                                            }}
                                            onDragEnd={() => {
                                                dragTaskRef.current = null
                                                setDragPreview(null)
                                            }}
                                            className="flex cursor-grab items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 transition-colors hover:border-neutral-300 active:cursor-grabbing"
                                        >
                                            <i
                                                className="fa-solid fa-grip-vertical text-xs text-neutral-300"
                                                aria-hidden="true"
                                            />
                                            <span className="flex-1 truncate text-xs font-semibold text-neutral-700">
                                                {task.title}
                                            </span>
                                            <span className="shrink-0 text-[10px] font-semibold text-neutral-400">
                                                {formatDuration(
                                                    task.duration ?? DEFAULT_TASK_DURATION
                                                )}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </aside>
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

            {deleteScope === 'prompt' && editing && (
                <Modal
                    open
                    onClose={() => setDeleteScope(null)}
                    title="Remove recurring block"
                    size="sm"
                    footer={
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteScope(null)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                    }
                >
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-neutral-600">
                            This block repeats. What would you like to remove?
                        </p>
                        <Button
                            variant="secondary"
                            onClick={() => doDelete('this')}
                            disabled={saving}
                        >
                            Just today
                        </Button>
                        <Button
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => doDelete('all')}
                            disabled={saving}
                        >
                            All occurrences
                        </Button>
                    </div>
                </Modal>
            )}
        </Container>
    )
}
