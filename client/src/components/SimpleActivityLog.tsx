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

// ─── Shared shapes ──────────────────────────────────────────────────────────────

/** The minimum a library item needs to seed a log — an id, name and duration. */
export interface ActivityLibraryItem {
    _id: string
    name: string
    duration: number
}

/** A completed activity record — a name snapshot, day, duration and notes. */
export interface ActivityRecord {
    _id: string
    name: string
    date: string
    duration: number
    notes?: string
    createdAt: string
}

/** Fields the create/update calls accept, with the library link keyed by domain. */
export interface ActivityLogFields {
    date: string
    duration?: number
    notes?: string
}

/** Everything the log needs to talk to its domain's library + log endpoints. */
export interface ActivityLogConfig {
    /** The reusable items a record can be logged against. */
    library: ActivityLibraryItem[]
    listLogs: () => Promise<ActivityRecord[]>
    /** Create a record linked to `libraryId`, seeded with `fields`. */
    createLog: (libraryId: string, fields: ActivityLogFields) => Promise<ActivityRecord>
    updateLog: (id: string, fields: ActivityLogFields) => Promise<ActivityRecord>
    deleteLog: (id: string) => Promise<void>
    /** Lower-case noun, e.g. "routine" or "recovery item". */
    noun: string
    /** Label for the library picker, e.g. "Routine *". */
    pickerLabel: string
    /** Icons + copy for the two empty states (no library, no logs). */
    icon: string
    emptyLibraryTitle: string
    emptyLibraryDescription: string
    emptyLogsTitle: string
    emptyLogsDescription: string
}

// ─── Date helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
    return todayKey()
}

// ─── Log ──────────────────────────────────────────────────────────────────────────

type Drawered = { mode: 'create' } | { mode: 'edit'; log: ActivityRecord } | null

/**
 * A log of completed activities (mobility routines or recovery items). Each entry
 * is recorded against a library item, snapshotting its name so the record stays
 * stable even if the library item is later edited or deleted.
 *
 * Filtered and paged ten at a time by the shared log controls, the same as the
 * strength and conditioning logs.
 */
export default function SimpleActivityLog({ config }: { config: ActivityLogConfig }) {
    const { library } = config
    const [loading, setLoading] = useState(true)
    const [logs, setLogs] = useState<ActivityRecord[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)

    const controls = useLogFilters(logs, { haystack: (l) => [l.notes] })

    useEffect(() => {
        config.listLogs()
            .then(setLogs)
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function handleAdd(libraryId: string, fields: ActivityLogFields) {
        const log = await config.createLog(libraryId, fields)
        setLogs((prev) => sortLogs([log, ...prev]))
    }

    async function handleSave(id: string, fields: ActivityLogFields) {
        const updated = await config.updateLog(id, fields)
        setLogs((prev) => sortLogs(prev.map((l) => (l._id === id ? updated : l))))
    }

    async function handleDelete(id: string) {
        setLogs((prev) => prev.filter((l) => l._id !== id))
        await config.deleteLog(id)
    }

    // This-week summary, derived from the whole log rather than the filtered view —
    // it's a training readout, not a description of what's on screen.
    const summary = useMemo(() => {
        const start = weekStartMonday(todayISO())
        const thisWeek = logs.filter((l) => l.date >= start)
        const minutes = thisWeek.reduce((sum, l) => sum + (l.duration || 0), 0)
        return { count: thisWeek.length, minutes }
    }, [logs])

    const hasHistory = logs.length > 0
    const plural = `${config.noun}s`

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                {hasHistory ? (
                    <p className="text-sm text-neutral-500">
                        <span className="font-semibold text-neutral-900">{summary.count}</span>{' '}
                        {summary.count === 1 ? config.noun : `${config.noun}s`} this week
                        {summary.minutes > 0 && (
                            <>
                                {' · '}
                                <span className="font-semibold text-neutral-900">
                                    {summary.minutes}
                                </span>{' '}
                                min
                            </>
                        )}
                    </p>
                ) : (
                    <span />
                )}
                <Button
                    icon="fa-solid fa-plus"
                    onClick={() => setDrawer({ mode: 'create' })}
                    disabled={!loading && library.length === 0}
                >
                    Log {config.noun}
                </Button>
            </div>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : library.length === 0 && !hasHistory ? (
                <EmptyState
                    icon={config.icon}
                    title={config.emptyLibraryTitle}
                    description={config.emptyLibraryDescription}
                />
            ) : !hasHistory ? (
                <EmptyState
                    icon="fa-solid fa-check-double"
                    title={config.emptyLogsTitle}
                    description={config.emptyLogsDescription}
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            Log {config.noun}
                        </Button>
                    }
                />
            ) : (
                <div className="flex flex-col gap-4">
                    <LogFilterBar
                        controls={controls}
                        searchPlaceholder={`Search ${plural}, notes…`}
                        nameLabel={`All ${plural}`}
                        nameIcon={config.icon}
                        noun={`logged ${config.noun}`}
                    />

                    {controls.filtered.length === 0 ? (
                        <EmptyState
                            icon="fa-solid fa-magnifying-glass"
                            title="No matches"
                            description={`No logged ${plural} match these filters.`}
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
                config={config}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

function sortLogs(logs: ActivityRecord[]): ActivityRecord[] {
    return [...logs].sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)
    )
}

// ─── Log row ──────────────────────────────────────────────────────────────────────

/**
 * One logged activity. Notes clamp to two lines so a page of ten stays scannable;
 * the row opens to show them in full.
 */
function LogRow({
    log,
    onEdit,
    onDelete,
}: {
    log: ActivityRecord
    onEdit: () => void
    onDelete: () => void
}) {
    const [open, setOpen] = useState(false)
    const expandable = !!log.notes

    return (
        <Card as="div" hover={false} className="flex items-start gap-3 !p-4">
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
                    <p className="font-semibold text-neutral-900">{log.name}</p>
                    {log.duration > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                            <span>
                                <i className="fa-regular fa-clock mr-1" aria-hidden="true" />
                                {log.duration} min
                            </span>
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
        </Card>
    )
}

// ─── Log form drawer ────────────────────────────────────────────────────────────

function LogFormDrawer({
    form,
    config,
    onClose,
    onAdd,
    onSave,
}: {
    form: Drawered
    config: ActivityLogConfig
    onClose: () => void
    onAdd: (libraryId: string, fields: ActivityLogFields) => Promise<void>
    onSave: (id: string, fields: ActivityLogFields) => Promise<void>
}) {
    const [view, setView] = useState<Drawered>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.log : undefined

    const [libraryId, setLibraryId] = useState('')
    const [date, setDate] = useState(todayISO())
    const [duration, setDuration] = useState('0')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (view?.mode === 'edit') {
            const l = view.log
            setLibraryId('')
            setDate(l.date)
            setDuration(String(l.duration))
            setNotes(l.notes ?? '')
        } else {
            setLibraryId('')
            setDate(todayISO())
            setDuration('0')
            setNotes('')
        }
        setSaving(false)
    }, [view])

    // Picking a library item in create mode seeds the duration.
    function chooseItem(id: string) {
        setLibraryId(id)
        const src = config.library.find((s) => s._id === id)
        if (src) setDuration(String(src.duration))
    }

    const isEdit = view?.mode === 'edit'
    // In create mode a library item must be picked; edits keep their snapshot.
    const valid = isEdit ? true : libraryId !== ''

    function num(s: string): number {
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 ? n : 0
    }

    async function submit() {
        if (!view || !valid) return
        const base: ActivityLogFields = {
            date,
            duration: num(duration),
            notes: notes.trim() || undefined,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') {
                await onAdd(libraryId, base)
            } else {
                await onSave(view.log._id, base)
            }
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const options = config.library.map((s) => ({ label: s.name, value: s._id }))

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="lg"
            title={isEdit ? `Edit logged ${config.noun}` : `Log ${config.noun}`}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : isEdit ? 'Save' : `Log ${config.noun}`}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                {isEdit ? (
                    <p className="font-semibold text-neutral-900">{editing?.name}</p>
                ) : (
                    <Select
                        label={config.pickerLabel}
                        placeholder={`Choose a ${config.noun}`}
                        value={libraryId}
                        onChange={chooseItem}
                        options={options}
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

                <Input
                    label="Duration (min)"
                    type="number"
                    min={0}
                    step="any"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                />

                <Textarea
                    label="Notes"
                    rows={3}
                    placeholder="How did it go? Anything to remember…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
        </Drawer>
    )
}
