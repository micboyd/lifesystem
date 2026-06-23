import { useEffect, useMemo, useRef, useState } from 'react'
import Container from '../components/Container'
import Spinner from '../components/Spinner'
import Select from '../components/Select'
import Button from '../components/Button'
import Input from '../components/Input'
import Textarea from '../components/Textarea'
import Badge from '../components/Badge'
import Progress from '../components/Progress'
import { useAuth } from '../context/AuthContext'
import { listRows, listValues } from '../services/totals'
import { updateSettings } from '../services/users'
import {
    listCourses,
    createCourse,
    updateCourse,
    deleteCourse,
} from '../services/courses'
import { bankByMonth, projectCourses, type CourseProjection } from '../lib/study'
import { computePacing, type CoursePacing } from '../lib/pacing'
import { todayKey, formatDateLong } from '../lib/calendar'
import type { TotalRow, TotalValue, Course } from '../types'

/** Wide window covering past entries and a long projection horizon. */
function bankRange(): { from: string; to: string } {
    const year = new Date().getFullYear()
    return { from: `${year - 1}-01-01`, to: `${year + 10}-12-31` }
}

function fmtHours(n: number): string {
    const v = Number(n)
    if (!Number.isFinite(v)) return '0h'
    return `${Number.isInteger(v) ? v : v.toFixed(2)}h`
}

export default function Study() {
    const { user, updateUser } = useAuth()
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<TotalRow[]>([])
    const [values, setValues] = useState<TotalValue[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [studyRowId, setStudyRowId] = useState(user?.settings?.studyRowId ?? '')
    // Drag-to-reorder: the item being dragged and the row it's hovering over.
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [overIndex, setOverIndex] = useState<number | null>(null)

    useEffect(() => {
        const { from, to } = bankRange()
        Promise.all([listRows(), listValues(from, to), listCourses()])
            .then(([rs, vs, cs]) => {
                setRows(rs)
                setValues(vs)
                setCourses(cs)
            })
            .finally(() => setLoading(false))
    }, [])

    // Hours for the selected row only.
    const rowValues = useMemo(
        () => (studyRowId ? values.filter((v) => v.row === studyRowId) : []),
        [values, studyRowId]
    )
    const today = todayKey()
    // The bank ahead is future-only; past days are shown as logged, not banked.
    const futureValues = useMemo(() => rowValues.filter((v) => v.date >= today), [rowValues, today])
    const bank = useMemo(() => bankByMonth(futureValues), [futureValues])
    const projection = useMemo(
        () => projectCourses(courses, rowValues, today),
        [courses, rowValues, today]
    )
    const pacing = useMemo(
        () => computePacing(projection, rowValues, today),
        [projection, rowValues, today]
    )
    const pacingByCourse = useMemo(
        () => new Map(pacing.courses.map((p) => [p.course._id, p])),
        [pacing]
    )

    async function handleSelectRow(id: string) {
        const prev = studyRowId
        setStudyRowId(id)
        try {
            const next = await updateSettings({ studyRowId: id })
            updateUser(next)
        } catch {
            setStudyRowId(prev)
        }
    }

    async function handleAddCourse(fields: {
        name: string
        kind: Course['kind']
        category?: string
        requiredHours: number
        completedHours: number
        notes?: string
        link?: string
        targetDate?: string
    }) {
        const course = await createCourse(fields)
        setCourses((prev) => [...prev, course])
    }

    async function handleSaveCourse(
        id: string,
        fields: Partial<
            Pick<
                Course,
                | 'name'
                | 'category'
                | 'requiredHours'
                | 'completedHours'
                | 'notes'
                | 'link'
                | 'targetDate'
            >
        >
    ) {
        const updated = await updateCourse(id, fields)
        setCourses((prev) => prev.map((c) => (c._id === id ? updated : c)))
    }

    async function handleDeleteCourse(id: string) {
        setCourses((prev) => prev.filter((c) => c._id !== id))
        await deleteCourse(id)
    }

    // Move a course to a new position in the queue (drag and drop), then persist
    // the sequential order of every item whose position changed.
    async function handleReorder(from: number, to: number) {
        if (from === to || from < 0 || to < 0 || from >= courses.length || to >= courses.length)
            return
        const reordered = [...courses]
        const [moved] = reordered.splice(from, 1)
        reordered.splice(to, 0, moved)
        const withOrder = reordered.map((c, i) => ({ ...c, order: i }))
        const prevById = new Map(courses.map((c) => [c._id, c.order]))
        setCourses(withOrder)
        const changed = withOrder.filter((c) => prevById.get(c._id) !== c.order)
        await Promise.all(changed.map((c) => updateCourse(c._id, { order: c.order }))).catch(() =>
            listCourses().then(setCourses)
        )
    }

    const rowOptions = rows.map((r) => ({ label: r.name, value: r._id }))

    return (
        <Container as="main" className="py-10">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Study</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Bank study hours from a calendar totals row, then see when each course finishes.
                </p>
            </header>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Source picker + bank summary */}
                    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">
                            Hours bank
                        </h2>
                        {rows.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                                No totals rows yet. Turn on Totals in the Calendar (Year view) and
                                add a row of study hours first.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <Select
                                    label="Study hours row"
                                    icon="fa-solid fa-clock"
                                    placeholder="Choose a totals row…"
                                    options={rowOptions}
                                    value={studyRowId || undefined}
                                    onChange={handleSelectRow}
                                    className="max-w-sm"
                                />
                                {studyRowId && (
                                    <BankSummary
                                        bank={bank}
                                        loggedHours={projection.loggedHours}
                                        availableHours={projection.availableHours}
                                    />
                                )}
                            </div>
                        )}
                    </section>

                    {/* Courses */}
                    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
                                Courses
                            </h2>
                            {projection.requiredHours > 0 && (
                                <span className="text-xs font-medium text-neutral-400">
                                    {fmtHours(projection.requiredHours)} remaining ·{' '}
                                    {fmtHours(projection.availableHours)} banked ahead
                                </span>
                            )}
                        </div>

                        {!studyRowId && (
                            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                Pick a study hours row above to project finish dates.
                            </p>
                        )}

                        <div className="flex flex-col gap-2">
                            {projection.courses.map((p, i) => (
                                <CourseRow
                                    key={p.course._id}
                                    projection={p}
                                    pacing={pacingByCourse.get(p.course._id)}
                                    hasSource={!!studyRowId}
                                    isDragging={dragIndex === i}
                                    isDragOver={dragIndex !== null && overIndex === i && dragIndex !== i}
                                    onSave={handleSaveCourse}
                                    onDelete={handleDeleteCourse}
                                    onDragStart={() => setDragIndex(i)}
                                    onDragOver={() => setOverIndex(i)}
                                    onDrop={() => {
                                        if (dragIndex !== null) handleReorder(dragIndex, i)
                                        setDragIndex(null)
                                        setOverIndex(null)
                                    }}
                                    onDragEnd={() => {
                                        setDragIndex(null)
                                        setOverIndex(null)
                                    }}
                                />
                            ))}
                        </div>

                        {projection.courses.length === 0 && (
                            <p className="mb-4 text-sm text-neutral-400">No courses yet.</p>
                        )}

                        <div className="mt-4 border-t border-neutral-100 pt-4">
                            <AddCourseForm onAdd={handleAddCourse} />
                        </div>
                    </section>
                </div>
            )}
        </Container>
    )
}

// ─── Bank summary ───────────────────────────────────────────────────────────

function BankSummary({
    bank,
    loggedHours,
    availableHours,
}: {
    bank: ReturnType<typeof bankByMonth>
    loggedHours: number
    availableHours: number
}) {
    return (
        <div>
            <div className="mb-3 flex flex-wrap gap-3">
                <Stat label="Logged so far" value={fmtHours(loggedHours)} />
                <Stat label="Available ahead" value={fmtHours(availableHours)} />
            </div>
            {bank.length === 0 ? (
                <p className="text-sm text-neutral-400">
                    No upcoming study hours assigned. Add hours to future days in this row on the
                    Calendar.
                </p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {bank.map((m) => (
                        <span
                            key={m.month}
                            className="flex items-center gap-1.5 rounded-lg bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600"
                        >
                            {m.label}
                            <span className="font-bold tabular-nums text-neutral-900">
                                {fmtHours(m.hours)}
                            </span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-neutral-950 px-4 py-2.5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                {label}
            </p>
            <p className="text-lg font-bold tabular-nums">{value}</p>
        </div>
    )
}

// ─── Course row ─────────────────────────────────────────────────────────────

interface CourseRowProps {
    projection: CourseProjection
    pacing?: CoursePacing
    hasSource: boolean
    isDragging: boolean
    isDragOver: boolean
    onSave: (
        id: string,
        fields: Partial<
            Pick<
                Course,
                | 'name'
                | 'category'
                | 'requiredHours'
                | 'completedHours'
                | 'notes'
                | 'link'
                | 'targetDate'
            >
        >
    ) => Promise<void>
    onDelete: (id: string) => void
    onDragStart: () => void
    onDragOver: () => void
    onDrop: () => void
    onDragEnd: () => void
}

function CourseRow({
    projection,
    pacing,
    hasSource,
    isDragging,
    isDragOver,
    onSave,
    onDelete,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: CourseRowProps) {
    const { course } = projection
    const isBlock = course.kind === 'block'
    const required = Math.max(course.requiredHours ?? 0, 0)
    const pct =
        required > 0
            ? Math.round((projection.completedHours / required) * 100)
            : projection.status === 'completed'
              ? 100
              : 0
    // The row is only draggable once a drag is initiated from the grip handle,
    // so clicks/selection elsewhere in the row behave normally.
    const dragReady = useRef(false)
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(course.name ?? '')
    const [category, setCategory] = useState(course.category ?? '')
    const [requiredInput, setRequired] = useState(String(course.requiredHours ?? ''))
    const [completed, setCompleted] = useState(String(course.completedHours ?? ''))
    const [notes, setNotes] = useState(course.notes ?? '')
    const [link, setLink] = useState(course.link ?? '')
    const [targetDate, setTargetDate] = useState(course.targetDate ?? '')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setName(course.name ?? '')
        setCategory(course.category ?? '')
        setRequired(String(course.requiredHours ?? ''))
        setCompleted(String(course.completedHours ?? ''))
        setNotes(course.notes ?? '')
        setLink(course.link ?? '')
        setTargetDate(course.targetDate ?? '')
    }, [course.name, course.category, course.requiredHours, course.completedHours, course.notes, course.link, course.targetDate])

    // Disarm the handle on any plain click release. A real drag ends with
    // 'dragend' (no trailing 'mouseup'), so this only fires when no drag started.
    useEffect(() => {
        const disarm = () => (dragReady.current = false)
        window.addEventListener('mouseup', disarm)
        return () => window.removeEventListener('mouseup', disarm)
    }, [])

    async function save() {
        const req = Number(requiredInput)
        const done = Number(completed)
        if (!name.trim() || !Number.isFinite(req) || req < 0) return
        setSaving(true)
        try {
            await onSave(course._id, {
                name: name.trim(),
                category: isBlock ? category.trim() : undefined,
                requiredHours: req,
                completedHours: Number.isFinite(done) && done >= 0 ? done : 0,
                notes: notes.trim(),
                link: !isBlock ? link.trim() : undefined,
                targetDate: !isBlock ? targetDate : undefined,
            })
            setEditing(false)
        } finally {
            setSaving(false)
        }
    }

    if (editing) {
        return (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3">
                    <Input
                        autoFocus
                        placeholder={isBlock ? 'What are you studying?' : 'Course name'}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    {isBlock && (
                        <Input
                            label="Type (optional)"
                            placeholder="Reading, revision, project…"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        />
                    )}
                    <div className="flex gap-3">
                        <Input
                            label="Required hours"
                            type="number"
                            min={0}
                            step="any"
                            value={requiredInput}
                            onChange={(e) => setRequired(e.target.value)}
                        />
                        <Input
                            label="Prior hours"
                            hint="Done before calendar tracking"
                            type="number"
                            min={0}
                            step="any"
                            value={completed}
                            onChange={(e) => setCompleted(e.target.value)}
                        />
                    </div>
                    <Textarea
                        label="Notes (optional)"
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                    {!isBlock && (
                        <Input
                            label="Link (optional)"
                            placeholder="https://…"
                            type="url"
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                        />
                    )}
                    {!isBlock && (
                        <Input
                            label="Target date (optional)"
                            hint="Finish-by date for on-track pacing"
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                        />
                    )}
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            onClick={save}
                            disabled={saving || !name.trim()}
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            draggable
            onDragStart={(e) => {
                if (!dragReady.current) {
                    e.preventDefault()
                    return
                }
                e.dataTransfer.effectAllowed = 'move'
                onDragStart()
            }}
            onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                onDragOver()
            }}
            onDrop={(e) => {
                e.preventDefault()
                onDrop()
            }}
            onDragEnd={() => {
                dragReady.current = false
                onDragEnd()
            }}
            className={[
                'rounded-2xl border bg-white p-4 shadow-sm transition-shadow',
                isDragging ? 'border-neutral-300 opacity-40' : 'border-neutral-200',
                isDragOver ? 'ring-2 ring-neutral-300' : '',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <div className="flex items-start gap-3">
                {/* Drag handle */}
                <button
                    type="button"
                    aria-label="Drag to reorder"
                    onMouseDown={() => (dragReady.current = true)}
                    onTouchStart={() => (dragReady.current = true)}
                    className="grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-neutral-300 transition-colors hover:text-neutral-500 active:cursor-grabbing"
                >
                    <i className="fa-solid fa-grip-vertical text-xs" aria-hidden="true" />
                </button>

                {/* Details */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-neutral-900">
                                {course.name ?? (isBlock ? 'Untitled block' : 'Untitled course')}
                            </p>
                            {isBlock && (
                                <Badge variant="outline">{course.category?.trim() || 'Block'}</Badge>
                            )}
                            <StatusBadge projection={projection} hasSource={hasSource} />
                        </div>

                        {/* Actions */}
                        <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setEditing(true)}
                                aria-label="Edit course"
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(course._id)}
                                aria-label="Delete course"
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                                <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-3 flex items-center gap-3">
                        <Progress
                            value={pct}
                            variant={projection.status === 'completed' ? 'success' : 'default'}
                            className="flex-1"
                        />
                        <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-500">
                            {pct}%
                        </span>
                    </div>

                    {/* Hours + finish */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs">
                        <span className="text-neutral-500">
                            <span className="font-semibold tabular-nums text-neutral-700">
                                {fmtHours(projection.completedHours)}
                            </span>{' '}
                            of {fmtHours(required)}
                            {projection.remainingHours > 0 && (
                                <>
                                    {' · '}
                                    <span className="font-semibold tabular-nums text-neutral-700">
                                        {fmtHours(projection.remainingHours)}
                                    </span>{' '}
                                    to go
                                </>
                            )}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <PacingChip pacing={pacing} />
                            <FinishChip projection={projection} hasSource={hasSource} />
                        </div>
                    </div>

                    {(course.notes || course.link) && (
                        <div className="mt-2 flex flex-col gap-1.5 border-t border-neutral-100 pt-2">
                            {course.notes && (
                                <p className="whitespace-pre-wrap text-sm text-neutral-400">
                                    {course.notes}
                                </p>
                            )}
                            {course.link && (
                                <a
                                    href={course.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                                >
                                    <i className="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true" />
                                    {course.link}
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function StatusBadge({
    projection,
    hasSource,
}: {
    projection: CourseProjection
    hasSource: boolean
}) {
    if (projection.status === 'completed') return <Badge variant="success">Completed</Badge>
    if (!hasSource) return null
    if (projection.status === 'insufficient') return <Badge variant="warning">Needs more hours</Badge>
    return <Badge variant="outline">Scheduled</Badge>
}

/** Compact pill summarising when a course will finish (or why it won't). */
function FinishChip({
    projection,
    hasSource,
}: {
    projection: CourseProjection
    hasSource: boolean
}) {
    if (!hasSource || projection.status === 'completed') return null
    if (projection.status === 'insufficient') {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                {fmtHours(projection.shortByHours)} short
            </span>
        )
    }
    if (!projection.finishDate) {
        return <span className="text-neutral-400">Not scheduled yet</span>
    }
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 font-medium text-neutral-700"
            title={
                projection.startDate
                    ? `Starts ${formatDateLong(projection.startDate)}`
                    : undefined
            }
        >
            <i className="fa-solid fa-flag-checkered text-neutral-400" aria-hidden="true" />
            Finishes {formatDateLong(projection.finishDate)}
        </span>
    )
}

/** On-track / behind pill, shown only for unfinished courses with a target date. */
function PacingChip({ pacing }: { pacing?: CoursePacing }) {
    if (!pacing || !pacing.targetDate || pacing.status === 'done') return null
    if (pacing.status === 'no-target') return null

    const config = {
        'on-track': {
            cls: 'bg-emerald-50 text-emerald-700',
            icon: 'fa-solid fa-check',
            label: 'On track',
        },
        behind: {
            cls: 'bg-amber-50 text-amber-700',
            icon: 'fa-solid fa-arrow-trend-down',
            label: Number.isFinite(pacing.neededPacePerDay)
                ? `Behind · need ${pacing.neededPacePerDay.toFixed(1)}h/day`
                : 'Behind',
        },
        overdue: {
            cls: 'bg-red-50 text-red-600',
            icon: 'fa-solid fa-triangle-exclamation',
            label: 'Past target',
        },
    }[pacing.status as 'on-track' | 'behind' | 'overdue']

    if (!config) return null
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${config.cls}`}
            title={
                pacing.targetDate
                    ? `Target ${formatDateLong(pacing.targetDate)}`
                    : undefined
            }
        >
            <i className={`${config.icon}`} aria-hidden="true" />
            {config.label}
        </span>
    )
}

// ─── Add course ─────────────────────────────────────────────────────────────

function AddCourseForm({
    onAdd,
}: {
    onAdd: (fields: {
        name: string
        kind: Course['kind']
        category?: string
        requiredHours: number
        completedHours: number
        notes?: string
        link?: string
        targetDate?: string
    }) => Promise<void>
}) {
    // null = collapsed; otherwise the kind being added.
    const [kind, setKind] = useState<Course['kind'] | null>(null)
    const [name, setName] = useState('')
    const [category, setCategory] = useState('')
    const [required, setRequired] = useState('')
    const [completed, setCompleted] = useState('')
    const [notes, setNotes] = useState('')
    const [link, setLink] = useState('')
    const [targetDate, setTargetDate] = useState('')
    const [saving, setSaving] = useState(false)

    const isBlock = kind === 'block'

    function reset() {
        setName('')
        setCategory('')
        setRequired('')
        setCompleted('')
        setNotes('')
        setLink('')
        setTargetDate('')
        setKind(null)
    }

    async function submit() {
        if (!kind) return
        const req = Number(required)
        if (!name.trim() || !Number.isFinite(req) || req < 0) return
        const done = Number(completed)
        setSaving(true)
        try {
            await onAdd({
                name: name.trim(),
                kind,
                category: isBlock ? category.trim() || undefined : undefined,
                requiredHours: req,
                completedHours: Number.isFinite(done) && done >= 0 ? done : 0,
                notes: notes.trim() || undefined,
                link: !isBlock ? link.trim() || undefined : undefined,
                targetDate: !isBlock ? targetDate || undefined : undefined,
            })
            reset()
        } finally {
            setSaving(false)
        }
    }

    if (!kind) {
        return (
            <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon="fa-solid fa-plus" onClick={() => setKind('course')}>
                    Add course
                </Button>
                <Button variant="secondary" icon="fa-solid fa-plus" onClick={() => setKind('block')}>
                    Add study block
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <Input
                autoFocus
                placeholder={isBlock ? 'What are you studying?' : 'Course name'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            {isBlock && (
                <Input
                    label="Type (optional)"
                    placeholder="Reading, revision, project…"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                />
            )}
            <div className="flex gap-3">
                <Input
                    label="Required hours"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="60"
                    value={required}
                    onChange={(e) => setRequired(e.target.value)}
                />
                <Input
                    label="Prior hours (optional)"
                    hint="Done before calendar tracking"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="0"
                    value={completed}
                    onChange={(e) => setCompleted(e.target.value)}
                />
            </div>
            <Textarea
                label="Notes (optional)"
                rows={2}
                placeholder={isBlock ? 'What is this block for?' : undefined}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
            />
            {!isBlock && (
                <Input
                    label="Link (optional)"
                    placeholder="https://…"
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                />
            )}
            {!isBlock && (
                <Input
                    label="Target date (optional)"
                    hint="Finish-by date for on-track pacing"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                />
            )}
            <div className="flex gap-2">
                <Button onClick={submit} disabled={saving || !name.trim() || required === ''}>
                    {saving ? 'Saving…' : isBlock ? 'Add block' : 'Save'}
                </Button>
                <Button variant="ghost" onClick={reset}>
                    Cancel
                </Button>
            </div>
        </div>
    )
}
