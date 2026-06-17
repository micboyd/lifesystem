import { useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import Spinner from '../components/Spinner'
import Select from '../components/Select'
import Button from '../components/Button'
import Input from '../components/Input'
import Badge from '../components/Badge'
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
import { todayKey, formatDateLong } from '../lib/calendar'
import type { TotalRow, TotalValue, Course } from '../types'

/** Wide window covering past entries and a long projection horizon. */
function bankRange(): { from: string; to: string } {
    const year = new Date().getFullYear()
    return { from: `${year - 1}-01-01`, to: `${year + 10}-12-31` }
}

function fmtHours(n: number): string {
    return `${Number.isInteger(n) ? n : n.toFixed(2)}h`
}

export default function Study() {
    const { user, updateUser } = useAuth()
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<TotalRow[]>([])
    const [values, setValues] = useState<TotalValue[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [studyRowId, setStudyRowId] = useState(user?.settings?.studyRowId ?? '')

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
        requiredHours: number
        completedHours: number
    }) {
        const course = await createCourse(fields)
        setCourses((prev) => [...prev, course])
    }

    async function handleSaveCourse(
        id: string,
        fields: Partial<Pick<Course, 'name' | 'requiredHours' | 'completedHours' | 'notes'>>
    ) {
        const updated = await updateCourse(id, fields)
        setCourses((prev) => prev.map((c) => (c._id === id ? updated : c)))
    }

    async function handleDeleteCourse(id: string) {
        setCourses((prev) => prev.filter((c) => c._id !== id))
        await deleteCourse(id)
    }

    // Swap a course with its neighbour to change queue priority.
    async function handleMove(index: number, dir: -1 | 1) {
        const target = index + dir
        if (target < 0 || target >= courses.length) return
        const a = courses[index]
        const b = courses[target]
        const reordered = [...courses]
        reordered[index] = b
        reordered[target] = a
        setCourses(reordered)
        await Promise.all([
            updateCourse(a._id, { order: b.order }),
            updateCourse(b._id, { order: a.order }),
        ]).catch(() => listCourses().then(setCourses))
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
                                    isFirst={i === 0}
                                    isLast={i === projection.courses.length - 1}
                                    hasSource={!!studyRowId}
                                    onSave={handleSaveCourse}
                                    onDelete={handleDeleteCourse}
                                    onMove={(dir) => handleMove(i, dir)}
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
    isFirst: boolean
    isLast: boolean
    hasSource: boolean
    onSave: (
        id: string,
        fields: Partial<Pick<Course, 'name' | 'requiredHours' | 'completedHours' | 'notes'>>
    ) => Promise<void>
    onDelete: (id: string) => void
    onMove: (dir: -1 | 1) => void
}

function CourseRow({
    projection,
    isFirst,
    isLast,
    hasSource,
    onSave,
    onDelete,
    onMove,
}: CourseRowProps) {
    const { course } = projection
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(course.name)
    const [required, setRequired] = useState(String(course.requiredHours))
    const [completed, setCompleted] = useState(String(course.completedHours))
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setName(course.name)
        setRequired(String(course.requiredHours))
        setCompleted(String(course.completedHours))
    }, [course.name, course.requiredHours, course.completedHours])

    async function save() {
        const req = Number(required)
        const done = Number(completed)
        if (!name.trim() || !Number.isFinite(req) || req < 0) return
        setSaving(true)
        try {
            await onSave(course._id, {
                name: name.trim(),
                requiredHours: req,
                completedHours: Number.isFinite(done) && done >= 0 ? done : 0,
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
                        placeholder="Course name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <div className="flex gap-3">
                        <Input
                            label="Required hours"
                            type="number"
                            min={0}
                            step="any"
                            value={required}
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
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
                {/* Reorder */}
                <div className="flex flex-col">
                    <button
                        type="button"
                        onClick={() => onMove(-1)}
                        disabled={isFirst}
                        aria-label="Move up"
                        className="grid h-5 w-5 place-items-center rounded text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <i className="fa-solid fa-chevron-up text-[10px]" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onMove(1)}
                        disabled={isLast}
                        aria-label="Move down"
                        className="grid h-5 w-5 place-items-center rounded text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <i className="fa-solid fa-chevron-down text-[10px]" aria-hidden="true" />
                    </button>
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-neutral-900">{course.name}</p>
                        <StatusBadge projection={projection} hasSource={hasSource} />
                    </div>
                    <p className="mt-0.5 text-sm text-neutral-500">
                        {fmtHours(course.requiredHours)} required
                        {projection.completedHours > 0 &&
                            ` · ${fmtHours(projection.completedHours)} done · ${fmtHours(projection.remainingHours)} to go`}
                    </p>
                    {hasSource && <ProjectionLine projection={projection} />}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
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

function ProjectionLine({ projection }: { projection: CourseProjection }) {
    if (projection.status === 'completed') return null
    if (projection.status === 'insufficient') {
        return (
            <p className="mt-1 text-sm font-medium text-amber-700">
                <i className="fa-solid fa-triangle-exclamation mr-1.5 text-xs" aria-hidden="true" />
                {fmtHours(projection.shortByHours)} short — log more study hours to finish.
            </p>
        )
    }
    if (!projection.finishDate) {
        return <p className="mt-1 text-sm text-neutral-400">No study hours scheduled yet.</p>
    }
    return (
        <p className="mt-1 text-sm font-medium text-neutral-700">
            <i className="fa-solid fa-flag-checkered mr-1.5 text-xs text-neutral-400" aria-hidden="true" />
            Finishes {formatDateLong(projection.finishDate)}
            {projection.startDate && (
                <span className="text-neutral-400">
                    {' '}
                    · starts {formatDateLong(projection.startDate)}
                </span>
            )}
        </p>
    )
}

// ─── Add course ─────────────────────────────────────────────────────────────

function AddCourseForm({
    onAdd,
}: {
    onAdd: (fields: { name: string; requiredHours: number; completedHours: number }) => Promise<void>
}) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [required, setRequired] = useState('')
    const [completed, setCompleted] = useState('')
    const [saving, setSaving] = useState(false)

    function reset() {
        setName('')
        setRequired('')
        setCompleted('')
        setOpen(false)
    }

    async function submit() {
        const req = Number(required)
        if (!name.trim() || !Number.isFinite(req) || req < 0) return
        const done = Number(completed)
        setSaving(true)
        try {
            await onAdd({
                name: name.trim(),
                requiredHours: req,
                completedHours: Number.isFinite(done) && done >= 0 ? done : 0,
            })
            reset()
        } finally {
            setSaving(false)
        }
    }

    if (!open) {
        return (
            <Button variant="secondary" icon="fa-solid fa-plus" onClick={() => setOpen(true)}>
                Add course
            </Button>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <Input
                autoFocus
                placeholder="Course name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
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
            <div className="flex gap-2">
                <Button onClick={submit} disabled={saving || !name.trim() || required === ''}>
                    {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="ghost" onClick={reset}>
                    Cancel
                </Button>
            </div>
        </div>
    )
}
