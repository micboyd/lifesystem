import { useEffect, useMemo, useState } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import Textarea from './Textarea'
import Select from './Select'
import EmptyState from './EmptyState'
import DropdownMenu from './DropdownMenu'
import Drawer from './Drawer'
import DatePicker from './DatePicker'
import Pagination from './Pagination'
import LineIcon from './LineIcon'
import LogFilterBar, { useLogFilters } from './LogFilterBar'
import { todayKey } from '../lib/calendar'
import { formatLogDate, weekStartMonday } from '../lib/logFilters'
import { listSessions } from '../services/conditioning'
import {
    listLogs,
    createLog,
    updateLog,
    deleteLog,
    type ConditioningLogInput,
} from '../services/conditioningLogs'
import { CONDITIONING_CATEGORIES } from '../types'
import type { ConditioningLog, ConditioningSession, ConditioningCategory } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** How many round chips a collapsed row shows before it says "+N more". */
const CHIP_LIMIT = 6

function todayISO(): string {
    return todayKey()
}

const CATEGORY_META: Record<ConditioningCategory, string> = {
    HIIT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    Cardio: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    Endurance: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    Mobility: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    Recovery: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

function CategoryChip({ category }: { category: ConditioningCategory }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CATEGORY_META[category]}`}
        >
            {category}
        </span>
    )
}

const CATEGORY_OPTIONS = [
    { label: 'All categories', value: '' },
    ...CONDITIONING_CATEGORIES.map((c) => ({ label: c, value: c })),
]

// ─── Sessions log ─────────────────────────────────────────────────────────────────

type Drawered =
    | { mode: 'create' }
    | { mode: 'edit'; log: ConditioningLog }
    | null

/**
 * The Sessions view is a log of completed conditioning sessions. Each entry is
 * recorded against a library session, snapshotting its name and category.
 *
 * Like the strength log it's filtered and paged ten at a time by the shared log
 * controls, with a category select slotted in alongside them.
 */
export default function ConditioningSessionsLog() {
    const [loading, setLoading] = useState(true)
    const [logs, setLogs] = useState<ConditioningLog[]>([])
    const [sessions, setSessions] = useState<ConditioningSession[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)
    const [category, setCategory] = useState('')

    const controls = useLogFilters(logs, {
        haystack: (l) => [l.notes, l.category, ...(l.rounds ?? []).map((r) => r.name)],
        extra: {
            match: (l) => !category || l.category === category,
            value: category,
            clear: () => setCategory(''),
        },
    })

    useEffect(() => {
        Promise.all([listLogs(), listSessions()])
            .then(([lg, ss]) => {
                setLogs(lg)
                setSessions(ss)
            })
            .finally(() => setLoading(false))
    }, [])

    async function handleAdd(fields: ConditioningLogInput) {
        const log = await createLog(fields)
        setLogs((prev) => sortLogs([log, ...prev]))
    }

    async function handleSave(id: string, fields: ConditioningLogInput) {
        const updated = await updateLog(id, fields)
        setLogs((prev) => sortLogs(prev.map((l) => (l._id === id ? updated : l))))
    }

    async function handleDelete(id: string) {
        setLogs((prev) => prev.filter((l) => l._id !== id))
        await deleteLog(id)
    }

    // This-week summary, derived from the whole log rather than the filtered view —
    // it's a training readout, not a description of what's on screen.
    const summary = useMemo(() => {
        const start = weekStartMonday(todayISO())
        const thisWeek = logs.filter((l) => l.date >= start)
        const rated = thisWeek.filter((l) => l.rpe != null)
        return {
            count: thisWeek.length,
            minutes: thisWeek.reduce((sum, l) => sum + (l.duration || 0), 0),
            rpe: rated.length
                ? Math.round((rated.reduce((sum, l) => sum + (l.rpe ?? 0), 0) / rated.length) * 10) / 10
                : null,
        }
    }, [logs])

    const hasHistory = logs.length > 0

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                {hasHistory ? (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-neutral-500">
                        <span>
                            <span className="font-semibold text-neutral-900">{summary.count}</span>{' '}
                            {summary.count === 1 ? 'session' : 'sessions'} this week
                        </span>
                        {summary.minutes > 0 && (
                            <span>
                                <i
                                    className="fa-regular fa-clock mr-1.5 text-neutral-300"
                                    aria-hidden="true"
                                />
                                <span className="font-semibold text-neutral-900">
                                    {summary.minutes}
                                </span>{' '}
                                min
                            </span>
                        )}
                        {summary.rpe != null && (
                            <span>
                                <i
                                    className="fa-solid fa-gauge-high mr-1.5 text-neutral-300"
                                    aria-hidden="true"
                                />
                                avg RPE{' '}
                                <span className="font-semibold text-neutral-900">{summary.rpe}</span>
                            </span>
                        )}
                    </div>
                ) : (
                    <span />
                )}
                <Button
                    icon="fa-solid fa-plus"
                    onClick={() => setDrawer({ mode: 'create' })}
                    disabled={!loading && sessions.length === 0}
                >
                    Log session
                </Button>
            </div>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : sessions.length === 0 && !hasHistory ? (
                <EmptyState
                    icon="fa-solid fa-heart-pulse"
                    title="No sessions to log"
                    description="Add a session to your Session Library first, then record it here once completed."
                />
            ) : !hasHistory ? (
                <EmptyState
                    icon="fa-solid fa-stopwatch"
                    title="No sessions logged yet"
                    description="Completed a conditioning session? Record it to build your history."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            Log session
                        </Button>
                    }
                />
            ) : (
                <div className="flex flex-col gap-4">
                    <LogFilterBar
                        controls={controls}
                        searchPlaceholder="Search sessions, rounds, notes…"
                        nameLabel="All sessions"
                        nameIcon="fa-solid fa-heart-pulse"
                        noun="logged session"
                    >
                        <Select
                            options={CATEGORY_OPTIONS}
                            value={category}
                            onChange={(v) => {
                                setCategory(v)
                                controls.setPage(1)
                            }}
                            placeholder="All categories"
                            icon="fa-solid fa-tag"
                            className="w-full sm:w-44"
                        />
                    </LogFilterBar>

                    {controls.filtered.length === 0 ? (
                        <EmptyState
                            icon="fa-solid fa-magnifying-glass"
                            title="No matches"
                            description="No logged sessions match these filters."
                            action={
                                <Button variant="secondary" onClick={controls.clear}>
                                    Clear filters
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <div className="flex flex-col gap-6">
                                {controls.grouped.map(([date, dayLogs]) => (
                                    <section key={date} className="flex flex-col gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                            {formatLogDate(date, todayISO())}
                                        </p>
                                        <div className="flex flex-col gap-2">
                                            {dayLogs.map((log) => (
                                                <LogRow
                                                    key={log._id}
                                                    log={log}
                                                    onEdit={() => setDrawer({ mode: 'edit', log })}
                                                    onDelete={() => handleDelete(log._id)}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>

                            <Pagination
                                page={controls.page}
                                pageCount={controls.pageCount}
                                onChange={controls.setPage}
                                className="mt-2 justify-center"
                            />
                        </>
                    )}
                </div>
            )}

            <LogFormDrawer
                form={drawer}
                sessions={sessions}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

function sortLogs(logs: ConditioningLog[]): ConditioningLog[] {
    return [...logs].sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)
    )
}

// ─── Log row ──────────────────────────────────────────────────────────────────────

/**
 * One logged session. Collapsed it's a scannable line with the first few rounds;
 * expanding it shows every round and the full notes.
 */
function LogRow({
    log,
    onEdit,
    onDelete,
}: {
    log: ConditioningLog
    onEdit: () => void
    onDelete: () => void
}) {
    const [open, setOpen] = useState(false)

    const rounds = log.rounds ?? []
    const hidden = open ? 0 : Math.max(0, rounds.length - CHIP_LIMIT)
    const shown = open ? rounds : rounds.slice(0, CHIP_LIMIT)
    // Only worth opening when something is actually held back.
    const expandable = hidden > 0 || rounds.length > CHIP_LIMIT || !!log.notes

    return (
        <Card as="div" hover={false} className="!p-0">
            <div className="flex items-start gap-2 p-4">
                <button
                    type="button"
                    onClick={() => expandable && setOpen((o) => !o)}
                    aria-expanded={expandable ? open : undefined}
                    className={[
                        'flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left',
                        expandable ? 'cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-neutral-900">{log.name}</p>
                            <CategoryChip category={log.category} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                            <span>
                                <i className="fa-regular fa-clock mr-1" aria-hidden="true" />
                                {log.duration} min
                            </span>
                            {log.rpe != null && (
                                <span>
                                    <i className="fa-solid fa-gauge-high mr-1" aria-hidden="true" />
                                    RPE {log.rpe}
                                </span>
                            )}
                            {rounds.length > 0 && (
                                <span>
                                    <i className="fa-solid fa-repeat mr-1" aria-hidden="true" />
                                    {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'}
                                </span>
                            )}
                        </div>

                        {shown.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {shown.map((r, i) => {
                                    const done = r.done >= r.target
                                    return (
                                        <span
                                            key={i}
                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                                                done
                                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                                                    : 'bg-neutral-50 text-neutral-600 ring-neutral-300'
                                            }`}
                                        >
                                            <i
                                                className={`fa-solid ${done ? 'fa-check' : 'fa-repeat'} text-[9px]`}
                                                aria-hidden="true"
                                            />
                                            {r.name} {r.done}/{r.target}
                                        </span>
                                    )
                                })}
                                {hidden > 0 && (
                                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium text-neutral-400">
                                        +{hidden} more
                                    </span>
                                )}
                            </div>
                        )}

                        {log.notes && (
                            <p
                                className={[
                                    'mt-2 whitespace-pre-wrap text-sm text-neutral-500',
                                    open ? '' : 'line-clamp-2',
                                ].join(' ')}
                            >
                                {log.notes}
                            </p>
                        )}
                    </div>

                    {expandable && (
                        <i
                            className={[
                                'fa-solid fa-chevron-down mt-1 shrink-0 text-xs text-neutral-300 transition-transform duration-150',
                                open ? 'rotate-180' : '',
                            ].join(' ')}
                            aria-hidden="true"
                        />
                    )}
                </button>

                <DropdownMenu
                    align="right"
                    className="-mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Log actions"
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>
        </Card>
    )
}

// ─── Log form drawer ────────────────────────────────────────────────────────────

const RPE_OPTIONS = [
    { label: 'Not recorded', value: '' },
    ...Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })),
]

function LogFormDrawer({
    form,
    sessions,
    onClose,
    onAdd,
    onSave,
}: {
    form: Drawered
    sessions: ConditioningSession[]
    onClose: () => void
    onAdd: (fields: ConditioningLogInput) => Promise<void>
    onSave: (id: string, fields: ConditioningLogInput) => Promise<void>
}) {
    const [view, setView] = useState<Drawered>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.log : undefined

    const [sessionId, setSessionId] = useState('')
    const [category, setCategory] = useState<ConditioningCategory>('HIIT')
    const [date, setDate] = useState(todayISO())
    const [duration, setDuration] = useState('0')
    const [rpe, setRpe] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (view?.mode === 'edit') {
            const l = view.log
            setSessionId(l.session ?? '')
            setCategory(l.category)
            setDate(l.date)
            setDuration(String(l.duration))
            setRpe(l.rpe != null ? String(l.rpe) : '')
            setNotes(l.notes ?? '')
        } else {
            setSessionId('')
            setCategory('HIIT')
            setDate(todayISO())
            setDuration('0')
            setRpe('')
            setNotes('')
        }
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    // Picking a session in create mode seeds the duration and category from the library.
    function chooseSession(id: string) {
        setSessionId(id)
        const src = sessions.find((s) => s._id === id)
        if (src) {
            setDuration(String(src.duration))
            setCategory(src.category)
        }
    }

    const isEdit = view?.mode === 'edit'
    // In create mode a library session must be picked; edits keep their snapshot.
    const valid = isEdit ? true : sessionId !== ''

    function num(s: string): number {
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 ? n : 0
    }

    async function submit() {
        if (!view || !valid) return
        const rpeNum = rpe === '' ? undefined : Number(rpe)
        const base = {
            date,
            duration: num(duration),
            rpe: rpeNum,
            notes: notes.trim() || undefined,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') {
                await onAdd({ ...base, session: sessionId })
            } else {
                await onSave(view.log._id, { ...base, category })
            }
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const sessionOptions = sessions.map((s) => ({ label: s.name, value: s._id }))

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="lg"
            title={isEdit ? 'Edit logged session' : 'Log session'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : isEdit ? 'Save' : 'Log session'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                {isEdit ? (
                    <>
                        <p className="font-semibold text-neutral-900">{editing?.name}</p>
                        <Select
                            label="Category *"
                            value={category}
                            onChange={(v) => setCategory(v as ConditioningCategory)}
                            options={CONDITIONING_CATEGORIES.map((c) => ({ label: c, value: c }))}
                        />
                    </>
                ) : (
                    <Select
                        label="Session *"
                        placeholder="Choose a session"
                        value={sessionId}
                        onChange={chooseSession}
                        options={sessionOptions}
                    />
                )}

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Date *
                    </label>
                    <DatePicker
                        value={date}
                        maxDate={todayISO()}
                        onChange={(v) => setDate(typeof v === 'string' ? v : todayISO())}
                    />
                </div>

                <div className="flex gap-3">
                    <Input
                        label="Duration (min)"
                        type="number"
                        min={0}
                        step="any"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="flex-1"
                    />
                    <Select
                        label="Effort (RPE)"
                        value={rpe}
                        onChange={setRpe}
                        options={RPE_OPTIONS}
                        className="flex-1"
                    />
                </div>

                <Textarea
                    label="Notes"
                    rows={3}
                    placeholder="How did it go? Pace, how you felt, anything to remember…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
        </Drawer>
    )
}
