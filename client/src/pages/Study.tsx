import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Spinner from '../components/Spinner'
import Select from '../components/Select'
import Button from '../components/Button'
import Input from '../components/Input'
import Textarea from '../components/Textarea'
import Badge from '../components/Badge'
import Progress from '../components/Progress'
import Tabs from '../components/Tabs'
import Alert from '../components/Alert'
import Accordion from '../components/Accordion'
import EmptyState from '../components/EmptyState'
import Drawer from '../components/Drawer'
import DropdownMenu from '../components/DropdownMenu'
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
import type { TotalRow, TotalValue, Course, CourseKind } from '../types'

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

const FILTERS = ['All', 'Courses', 'Blocks', 'Completed'] as const
type Filter = (typeof FILTERS)[number]

/** Fields shared by the create/edit form. */
interface CourseFields {
    name: string
    category?: string
    requiredHours: number
    completedHours: number
    notes?: string
    link?: string
    targetDate?: string
}

/** The form drawer is either adding a new course/block or editing an existing one. */
type FormState =
    | { mode: 'create'; kind: CourseKind }
    | { mode: 'edit'; kind: CourseKind; course: Course }
    | null

export default function Study() {
    const { user, updateUser } = useAuth()
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<TotalRow[]>([])
    const [values, setValues] = useState<TotalValue[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [studyRowId, setStudyRowId] = useState(user?.settings?.studyRowId ?? '')
    const [filter, setFilter] = useState<Filter>('All')
    const [form, setForm] = useState<FormState>(null)
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

    // projectCourses preserves the `courses` array order, so a projection's index
    // matches its index in `courses` — which the drag-reorder relies on.
    const visible = useMemo(() => {
        if (filter === 'Courses') return projection.courses.filter((p) => p.course.kind === 'course')
        if (filter === 'Blocks') return projection.courses.filter((p) => p.course.kind === 'block')
        if (filter === 'Completed')
            return projection.courses.filter((p) => p.status === 'completed')
        return projection.courses
    }, [projection.courses, filter])

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

    async function handleAddCourse(kind: CourseKind, fields: CourseFields) {
        const course = await createCourse({ ...fields, kind })
        setCourses((prev) => [...prev, course])
    }

    async function handleSaveCourse(id: string, fields: CourseFields) {
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
    // Reordering only makes sense over the full, unfiltered list.
    const reorderable = filter === 'All'

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
                    <Card as="section">
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
                                        remainingHours={projection.requiredHours}
                                    />
                                )}
                            </div>
                        )}
                    </Card>

                    {/* Courses */}
                    <Card as="section">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <Tabs
                                tabs={[...FILTERS]}
                                value={filter}
                                onChange={(t) => setFilter(t as Filter)}
                            />
                            <DropdownMenu
                                align="right"
                                trigger={
                                    <Button size="sm" icon="fa-solid fa-plus">
                                        Add
                                    </Button>
                                }
                                items={[
                                    {
                                        label: 'Course',
                                        icon: 'fa-solid fa-graduation-cap',
                                        onClick: () => setForm({ mode: 'create', kind: 'course' }),
                                    },
                                    {
                                        label: 'Study block',
                                        icon: 'fa-solid fa-cubes',
                                        onClick: () => setForm({ mode: 'create', kind: 'block' }),
                                    },
                                ]}
                            />
                        </div>

                        {!studyRowId && (
                            <Alert variant="info" className="mb-4">
                                Pick a study hours row above to project finish dates.
                            </Alert>
                        )}

                        {projection.courses.length === 0 ? (
                            <EmptyState
                                icon="fa-regular fa-rectangle-list"
                                title="No courses yet"
                                description="Add a course to project its finish date, or a study block to track ad-hoc hours."
                                action={
                                    <Button
                                        icon="fa-solid fa-plus"
                                        onClick={() => setForm({ mode: 'create', kind: 'course' })}
                                    >
                                        Add course
                                    </Button>
                                }
                            />
                        ) : visible.length === 0 ? (
                            <p className="py-8 text-center text-sm text-neutral-400">
                                Nothing in “{filter}”.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {visible.map((p) => {
                                    const i = projection.courses.indexOf(p)
                                    return (
                                        <CourseRow
                                            key={p.course._id}
                                            projection={p}
                                            pacing={pacingByCourse.get(p.course._id)}
                                            hasSource={!!studyRowId}
                                            reorderable={reorderable}
                                            isDragging={dragIndex === i}
                                            isDragOver={
                                                dragIndex !== null &&
                                                overIndex === i &&
                                                dragIndex !== i
                                            }
                                            onEdit={() =>
                                                setForm({
                                                    mode: 'edit',
                                                    kind: p.course.kind,
                                                    course: p.course,
                                                })
                                            }
                                            onDelete={() => handleDeleteCourse(p.course._id)}
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
                                    )
                                })}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            <CourseFormDrawer
                form={form}
                onClose={() => setForm(null)}
                onAdd={handleAddCourse}
                onSave={handleSaveCourse}
            />
        </Container>
    )
}

// ─── Bank summary ───────────────────────────────────────────────────────────

function BankSummary({
    bank,
    loggedHours,
    availableHours,
    remainingHours,
}: {
    bank: ReturnType<typeof bankByMonth>
    loggedHours: number
    availableHours: number
    remainingHours: number
}) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
                <Stat label="Logged so far" value={fmtHours(loggedHours)} />
                <Stat label="Available ahead" value={fmtHours(availableHours)} />
                <Stat label="Remaining" value={fmtHours(remainingHours)} />
            </div>
            {bank.length === 0 ? (
                <p className="text-sm text-neutral-400">
                    No upcoming study hours assigned. Add hours to future days in this row on the
                    Calendar.
                </p>
            ) : (
                <Accordion
                    className="bg-white"
                    items={[
                        {
                            title: `Upcoming by month · ${bank.length} ${bank.length === 1 ? 'month' : 'months'}`,
                            content: (
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
                            ),
                        },
                    ]}
                />
            )}
        </div>
    )
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex-1 rounded-xl bg-neutral-950 px-4 py-2.5 text-white">
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
    reorderable: boolean
    isDragging: boolean
    isDragOver: boolean
    onEdit: () => void
    onDelete: () => void
    onDragStart: () => void
    onDragOver: () => void
    onDrop: () => void
    onDragEnd: () => void
}

function CourseRow({
    projection,
    pacing,
    hasSource,
    reorderable,
    isDragging,
    isDragOver,
    onEdit,
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

    // Disarm the handle on any plain click release. A real drag ends with
    // 'dragend' (no trailing 'mouseup'), so this only fires when no drag started.
    useEffect(() => {
        const disarm = () => (dragReady.current = false)
        window.addEventListener('mouseup', disarm)
        return () => window.removeEventListener('mouseup', disarm)
    }, [])

    return (
        <div
            draggable={reorderable}
            onDragStart={(e) => {
                if (!dragReady.current) {
                    e.preventDefault()
                    return
                }
                e.dataTransfer.effectAllowed = 'move'
                onDragStart()
            }}
            onDragOver={(e) => {
                if (!reorderable) return
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
                {reorderable && (
                    <button
                        type="button"
                        aria-label="Drag to reorder"
                        onMouseDown={() => (dragReady.current = true)}
                        onTouchStart={() => (dragReady.current = true)}
                        className="grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-neutral-300 transition-colors hover:text-neutral-500 active:cursor-grabbing"
                    >
                        <i className="fa-solid fa-grip-vertical text-xs" aria-hidden="true" />
                    </button>
                )}

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
                        </div>

                        {/* Actions */}
                        <DropdownMenu
                            align="right"
                            className="-mr-1 -mt-1 shrink-0"
                            trigger={
                                <button
                                    type="button"
                                    aria-label="Course actions"
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                    <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                                </button>
                            }
                            items={[
                                { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                                {
                                    label: 'Delete',
                                    icon: 'fa-solid fa-trash-can',
                                    danger: true,
                                    onClick: onDelete,
                                },
                            ]}
                        />
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

                    {/* Hours + status */}
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
                        <RowStatus projection={projection} pacing={pacing} hasSource={hasSource} />
                    </div>

                    {(course.notes || course.link) && (
                        <div className="mt-2 flex flex-col gap-1.5 border-t border-neutral-100 pt-2">
                            {course.notes && (
                                <p className="line-clamp-2 whitespace-pre-wrap text-sm text-neutral-400">
                                    {course.notes}
                                </p>
                            )}
                            {course.link && (
                                <a
                                    href={course.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                                >
                                    <i
                                        className="fa-solid fa-arrow-up-right-from-square text-xs"
                                        aria-hidden="true"
                                    />
                                    Open link
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * A single status indicator per row. Priority: completed → pacing warnings
 * (behind/overdue) → insufficient capacity → projected finish date. This keeps
 * one clear signal instead of stacking a status badge, pacing chip and finish chip.
 */
function RowStatus({
    projection,
    pacing,
    hasSource,
}: {
    projection: CourseProjection
    pacing?: CoursePacing
    hasSource: boolean
}) {
    if (projection.status === 'completed') {
        return <Badge variant="success">Completed</Badge>
    }
    if (!hasSource) return null

    const pacingActive = pacing && pacing.targetDate && pacing.status !== 'done'

    if (pacingActive && pacing.status === 'overdue') {
        return <Chip cls="bg-red-50 text-red-600" icon="fa-solid fa-triangle-exclamation" title={`Target ${formatDateLong(pacing.targetDate!)}`}>Past target</Chip>
    }
    if (pacingActive && pacing.status === 'behind') {
        const label = Number.isFinite(pacing.neededPacePerDay)
            ? `Behind · need ${pacing.neededPacePerDay.toFixed(1)}h/day`
            : 'Behind'
        return <Chip cls="bg-amber-50 text-amber-700" icon="fa-solid fa-arrow-trend-down" title={`Target ${formatDateLong(pacing.targetDate!)}`}>{label}</Chip>
    }
    if (projection.status === 'insufficient') {
        return <Chip cls="bg-amber-50 text-amber-700" icon="fa-solid fa-triangle-exclamation">{fmtHours(projection.shortByHours)} short</Chip>
    }
    if (!projection.finishDate) {
        return <span className="text-neutral-400">Not scheduled yet</span>
    }
    // On track (or no target set): show the projected finish, plus a subtle
    // on-track check when a target date confirms it.
    const onTrack = pacingActive && pacing.status === 'on-track'
    return (
        <Chip
            cls="bg-neutral-100 text-neutral-700"
            icon={onTrack ? 'fa-solid fa-check text-emerald-600' : 'fa-solid fa-flag-checkered text-neutral-400'}
            title={projection.startDate ? `Starts ${formatDateLong(projection.startDate)}` : undefined}
        >
            Finishes {formatDateLong(projection.finishDate)}
        </Chip>
    )
}

/** Small status pill used by RowStatus. */
function Chip({
    cls,
    icon,
    title,
    children,
}: {
    cls: string
    icon: string
    title?: string
    children: ReactNode
}) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${cls}`}
            title={title}
        >
            <i className={icon} aria-hidden="true" />
            {children}
        </span>
    )
}

// ─── Add / edit course drawer ─────────────────────────────────────────────────

function CourseFormDrawer({
    form,
    onClose,
    onAdd,
    onSave,
}: {
    form: FormState
    onClose: () => void
    onAdd: (kind: CourseKind, fields: CourseFields) => Promise<void>
    onSave: (id: string, fields: CourseFields) => Promise<void>
}) {
    // Retain the last form while the drawer animates closed so its contents
    // don't flicker empty during the slide-out.
    const [view, setView] = useState<FormState>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const open = !!form
    const kind = view?.kind ?? 'course'
    const isBlock = kind === 'block'
    const editing = view?.mode === 'edit' ? view.course : undefined

    const [name, setName] = useState('')
    const [category, setCategory] = useState('')
    const [required, setRequired] = useState('')
    const [completed, setCompleted] = useState('')
    const [notes, setNotes] = useState('')
    const [link, setLink] = useState('')
    const [targetDate, setTargetDate] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset the fields each time the drawer opens for a different item.
    useEffect(() => {
        setName(editing?.name ?? '')
        setCategory(editing?.category ?? '')
        setRequired(editing?.requiredHours != null ? String(editing.requiredHours) : '')
        setCompleted(editing?.completedHours != null ? String(editing.completedHours) : '')
        setNotes(editing?.notes ?? '')
        setLink(editing?.link ?? '')
        setTargetDate(editing?.targetDate ?? '')
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const req = Number(required)
    const valid = name.trim() !== '' && Number.isFinite(req) && req >= 0 && required !== ''

    async function submit() {
        if (!view || !valid) return
        const done = Number(completed)
        const fields: CourseFields = {
            name: name.trim(),
            category: isBlock ? category.trim() || undefined : undefined,
            requiredHours: req,
            completedHours: Number.isFinite(done) && done >= 0 ? done : 0,
            notes: notes.trim() || undefined,
            link: !isBlock ? link.trim() || undefined : undefined,
            targetDate: !isBlock ? targetDate || undefined : undefined,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') await onAdd(kind, fields)
            else await onSave(view.course._id, fields)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const noun = isBlock ? 'study block' : 'course'
    const title = `${view?.mode === 'edit' ? 'Edit' : 'Add'} ${noun}`

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : view?.mode === 'edit' ? 'Save' : 'Add'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <Input
                    label={isBlock ? 'What are you studying?' : 'Course name'}
                    autoFocus
                    placeholder={isBlock ? 'e.g. Spanish revision' : 'Course name'}
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
                        placeholder="60"
                        value={required}
                        onChange={(e) => setRequired(e.target.value)}
                    />
                    <Input
                        label="Prior hours"
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
                    rows={3}
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
            </div>
        </Drawer>
    )
}
