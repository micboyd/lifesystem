import { useEffect, useRef, useState, type ReactNode } from 'react'
import Drawer from '../Drawer'
import DatePicker from '../DatePicker'
import RefPicker, { type RefOption } from './RefPicker'
import { PROJECT_COLORS, waitingDays } from '../../lib/work'
import { formatDateShort } from '../../lib/calendar'
import type { WorkTaskInput } from '../../services/workTasks'
import type {
    Person,
    WorkProject,
    WorkTask,
    WorkTaskPriority,
    WorkTaskStatus,
} from '../../types'

type SaveState = 'idle' | 'saving' | 'saved'

interface TaskDrawerProps {
    task: WorkTask | null
    open: boolean
    onClose: () => void
    projects: WorkProject[]
    people: Person[]
    today: string
    onSave: (id: string, patch: Partial<WorkTaskInput>) => Promise<void>
    onDelete: (task: WorkTask) => void
    onCreateProject: (name: string) => Promise<WorkProject | null>
    onCreatePerson: (name: string) => Promise<Person | null>
}

const STATUS_OPTIONS: { value: WorkTaskStatus; label: string; icon: string }[] = [
    { value: 'todo', label: 'To do', icon: 'fa-regular fa-circle' },
    { value: 'doing', label: 'Doing', icon: 'fa-solid fa-play' },
    { value: 'waiting', label: 'Waiting', icon: 'fa-solid fa-hourglass-half' },
    { value: 'done', label: 'Done', icon: 'fa-solid fa-check' },
]

const PRIORITY_OPTIONS: { value: WorkTaskPriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
]

/** How long to sit on a keystroke before writing it back. */
const TYPING_DEBOUNCE = 700

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </span>
            {children}
        </div>
    )
}

function Segmented<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string; icon?: string }[]
    value: T
    onChange: (value: T) => void
}) {
    return (
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={[
                        'flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition-all duration-150',
                        option.value === value
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-500 hover:text-neutral-900',
                    ].join(' ')}
                >
                    {option.icon && <i className={`${option.icon} text-[10px]`} aria-hidden="true" />}
                    {option.label}
                </button>
            ))}
        </div>
    )
}

interface TaskFieldsProps extends Omit<TaskDrawerProps, 'task' | 'open' | 'onClose' | 'onDelete'> {
    task: WorkTask
    onSaveState: (state: SaveState) => void
}

/**
 * The editable body, mounted fresh per task.
 *
 * Keyed by task id upstream so the draft state is rebuilt by remounting rather
 * than by an effect that writes state on every open — the drafts then can't
 * lag a task behind, and there's no effect racing the person typing.
 */
function TaskFields({
    task,
    projects,
    people,
    today,
    onSave,
    onSaveState,
    onCreateProject,
    onCreatePerson,
}: TaskFieldsProps) {
    const [title, setTitle] = useState(task.title)
    const [notes, setNotes] = useState(task.notes ?? '')
    const [source, setSource] = useState(task.source ?? '')
    const [waitingFor, setWaitingFor] = useState(task.waitingFor ?? '')

    const timer = useRef<ReturnType<typeof setTimeout>>()
    /** Text edits typed but not yet written back. */
    const pending = useRef<Partial<WorkTaskInput>>({})

    async function saveNow(patch: Partial<WorkTaskInput>) {
        onSaveState('saving')
        try {
            await onSave(task._id, patch)
            onSaveState('saved')
        } catch {
            onSaveState('idle')
        }
    }

    // The unmount flush below runs the first render's closure, so the save it
    // calls is held in a ref that every commit refreshes — otherwise a write on
    // the way out would go through a stale copy of the parent's handler.
    const latestSave = useRef(saveNow)
    useEffect(() => {
        latestSave.current = saveNow
    })

    function flush() {
        clearTimeout(timer.current)
        const patch = pending.current
        pending.current = {}
        if (Object.keys(patch).length) void latestSave.current(patch)
    }

    // Closing the drawer unmounts this, so an edit mid-keystroke is written on
    // the way out instead of being dropped.
    useEffect(() => flush, [])

    /** Queue a text edit; the write happens once typing pauses. */
    function edit(patch: Partial<WorkTaskInput>) {
        pending.current = { ...pending.current, ...patch }
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, TYPING_DEBOUNCE)
    }

    /** A single-click change — no reason to wait on it. */
    function apply(patch: Partial<WorkTaskInput>) {
        void saveNow(patch)
    }

    const projectOptions: RefOption[] = projects
        .filter((p) => p.status !== 'archived' || p._id === task.project)
        .map((p) => ({
            id: p._id,
            label: p.name,
            dotClass: PROJECT_COLORS[p.color].dot,
            hint: p.status === 'active' ? undefined : p.status,
        }))

    const peopleOptions: RefOption[] = people.map((p) => ({
        id: p._id,
        label: p.name,
        hint: p.role,
    }))

    return (
        <div className="flex flex-col gap-5">
            <textarea
                value={title}
                rows={2}
                onChange={(e) => {
                    setTitle(e.target.value)
                    const next = e.target.value.trim()
                    if (next) edit({ title: next })
                }}
                placeholder="What needs doing?"
                aria-label="Task title"
                className="w-full resize-none rounded-xl border border-transparent bg-neutral-50 px-3 py-2 text-base font-semibold leading-snug tracking-tight text-neutral-900 outline-none transition-colors placeholder:font-normal placeholder:text-neutral-400 focus:border-neutral-200 focus:bg-white focus:ring-2 focus:ring-neutral-200"
            />

            <Field label="Status">
                <Segmented
                    options={STATUS_OPTIONS}
                    value={task.status}
                    onChange={(status) => apply({ status })}
                />
            </Field>

            {/* Only shown once it's actually blocked — an empty "waiting on" on
                every task is noise on the 90% of them that aren't. */}
            {task.status === 'waiting' && (
                <div className="flex flex-col gap-3 rounded-2xl bg-marigold-50/60 p-4">
                    <Field label="Waiting on">
                        <div className="flex flex-wrap items-center gap-2">
                            <RefPicker
                                options={peopleOptions}
                                value={task.waitingOn}
                                onChange={(waitingOn) => apply({ waitingOn })}
                                onCreate={async (name) => {
                                    const person = await onCreatePerson(name)
                                    return person ? { id: person._id, label: person.name } : null
                                }}
                                createLabel="Add"
                                placeholder="Nobody yet"
                                clearLabel="Nobody"
                                icon="fa-solid fa-user"
                            />
                            {task.waitingSince && (
                                <span className="text-xs text-amber-700">
                                    {waitingDays(task, today)} days
                                </span>
                            )}
                        </div>
                    </Field>
                    <input
                        value={waitingFor}
                        onChange={(e) => {
                            setWaitingFor(e.target.value)
                            edit({ waitingFor: e.target.value })
                        }}
                        placeholder="What exactly are you waiting for?"
                        aria-label="What you are waiting for"
                        className="w-full rounded-xl border border-marigold-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-marigold-200"
                    />
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project">
                    <RefPicker
                        options={projectOptions}
                        value={task.project}
                        onChange={(project) => apply({ project })}
                        onCreate={async (name) => {
                            const created = await onCreateProject(name)
                            return created
                                ? {
                                      id: created._id,
                                      label: created.name,
                                      dotClass: PROJECT_COLORS[created.color].dot,
                                  }
                                : null
                        }}
                        createLabel="New project"
                        placeholder="No project"
                        clearLabel="No project"
                        icon="fa-solid fa-diagram-project"
                    />
                </Field>

                <Field label="Due">
                    <DatePicker
                        mode="single"
                        value={task.dueDate ?? null}
                        onChange={(value) =>
                            apply({ dueDate: typeof value === 'string' ? value : null })
                        }
                        placeholder="No date"
                    />
                </Field>
            </div>

            <Field label="Priority">
                <Segmented
                    options={PRIORITY_OPTIONS}
                    value={task.priority}
                    onChange={(priority) => apply({ priority })}
                />
            </Field>

            <Field label="Notes">
                <textarea
                    value={notes}
                    rows={6}
                    onChange={(e) => {
                        setNotes(e.target.value)
                        edit({ notes: e.target.value })
                    }}
                    placeholder="Background, links, what done looks like…"
                    aria-label="Notes"
                    className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                />
            </Field>

            <Field label="Source">
                <input
                    value={source}
                    onChange={(e) => {
                        setSource(e.target.value)
                        edit({ source: e.target.value })
                    }}
                    placeholder="Where it came from — a meeting, an email, a corridor"
                    aria-label="Source"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                />
            </Field>
        </div>
    )
}

/**
 * The full editor for one task.
 *
 * Every control writes straight through — there is no Save button, because a
 * drawer you can dismiss with Escape and a pending unsaved edit are a bad pair.
 * Typing is debounced and reported in the header, so the write is visible
 * without being in the way.
 */
export default function TaskDrawer({
    task,
    open,
    onClose,
    onDelete,
    ...fieldProps
}: TaskDrawerProps) {
    const [saveState, setSaveState] = useState<SaveState>('idle')

    if (!task) return null

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title="Task"
            badge={saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : undefined}
            size="lg"
            footer={
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-neutral-400">
                        {task.completedAt
                            ? `Completed ${formatDateShort(task.completedAt.slice(0, 10))}`
                            : `Added ${formatDateShort(task.createdAt.slice(0, 10))}`}
                    </span>
                    <button
                        type="button"
                        onClick={() => onDelete(task)}
                        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50"
                    >
                        <i className="fa-solid fa-trash text-[11px]" aria-hidden="true" />
                        Delete task
                    </button>
                </div>
            }
        >
            <TaskFields
                key={task._id}
                task={task}
                onSaveState={setSaveState}
                {...fieldProps}
            />
        </Drawer>
    )
}
