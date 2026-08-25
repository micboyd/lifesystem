import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Container from '../../components/Container'
import Avatar from '../../components/Avatar'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import ConfirmModal from '../../components/ConfirmModal'
import DropdownMenu, { type MenuEntry } from '../../components/DropdownMenu'
import RefPicker, { type RefOption } from '../../components/work/RefPicker'
import TaskDrawer from '../../components/work/TaskDrawer'
import { useTaskDrawer } from '../../components/work/useTaskDrawer'
import { useToast } from '../../context/ToastContext'
import { todayKey } from '../../lib/calendar'
import {
    daysSinceNudge,
    groupByPerson,
    needsChase,
    PROJECT_COLORS,
    waitingDays,
    waitTone,
    type WaitTone,
} from '../../lib/work'
import {
    createTask,
    deleteTask as deleteTaskRequest,
    listTasks,
    nudgeTask,
    updateTask,
    type WorkTaskInput,
} from '../../services/workTasks'
import { createProject, listProjects } from '../../services/workProjects'
import { createPerson, listPeople } from '../../services/people'
import type { Person, WorkProject, WorkTask } from '../../types'

/** Colour by how long it has sat: calm for a few days, loud after a fortnight. */
const TONE_CLASSES: Record<WaitTone, { badge: string; text: string }> = {
    fresh: { badge: 'bg-neutral-100 text-neutral-500', text: 'text-neutral-400' },
    aging: { badge: 'bg-marigold-50 text-amber-700', text: 'text-amber-700' },
    stale: { badge: 'bg-red-50 text-red-600', text: 'text-red-600' },
}

interface WaitingRowProps {
    task: WorkTask
    project?: WorkProject
    today: string
    onOpen: (task: WorkTask) => void
    onChase: (task: WorkTask) => void
    onUnblock: (task: WorkTask) => void
    onComplete: (task: WorkTask) => void
    onDelete: (task: WorkTask) => void
}

function WaitingRow({
    task,
    project,
    today,
    onOpen,
    onChase,
    onUnblock,
    onComplete,
    onDelete,
}: WaitingRowProps) {
    const days = waitingDays(task, today)
    const tone = TONE_CLASSES[waitTone(days)]
    const chased = daysSinceNudge(task, today)
    const due = needsChase(task, today)

    const menu: MenuEntry[] = [
        { label: 'It arrived', icon: 'fa-solid fa-check', onClick: () => onComplete(task) },
        { label: 'Unblock', icon: 'fa-solid fa-lock-open', onClick: () => onUnblock(task) },
        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: () => onOpen(task) },
        'divider',
        { label: 'Delete', icon: 'fa-solid fa-trash', onClick: () => onDelete(task), danger: true },
    ]

    return (
        <li className="group flex items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors duration-150 hover:bg-neutral-50">
            <span
                className={`mt-0.5 grid shrink-0 place-items-center rounded-full px-2 py-1 text-[11px] font-bold tabular-nums ${tone.badge}`}
                aria-label={`Waiting ${days} days`}
            >
                {days}d
            </span>

            <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium leading-snug text-neutral-900">
                    {task.title}
                </span>
                {task.waitingFor && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                        {task.waitingFor}
                    </span>
                )}
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {project && (
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PROJECT_COLORS[project.color].chip}`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${PROJECT_COLORS[project.color].dot}`} />
                            {project.name}
                        </span>
                    )}
                    <span className={`text-[11px] ${due ? tone.text : 'text-neutral-400'}`}>
                        {chased === null
                            ? 'Never chased'
                            : chased === 0
                              ? 'Chased today'
                              : `Chased ${chased} day${chased === 1 ? '' : 's'} ago`}
                    </span>
                </span>
            </button>

            <div className="mt-0.5 flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={() => onChase(task)}
                    className={[
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        due
                            ? 'bg-brand-600 text-white hover:bg-brand-500'
                            : 'text-neutral-400 hover:bg-neutral-200/70 hover:text-neutral-800',
                    ].join(' ')}
                >
                    Chase
                </button>
                <DropdownMenu
                    align="right"
                    items={menu}
                    trigger={
                        <span
                            role="button"
                            aria-label={`Actions for ${task.title}`}
                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-200/70 hover:text-neutral-700"
                        >
                            <i className="fa-solid fa-ellipsis-vertical text-xs" aria-hidden="true" />
                        </span>
                    }
                />
            </div>
        </li>
    )
}

/**
 * Everything blocked on someone else, oldest first.
 *
 * The page is a view over the same tasks as /work/tasks — an item you're
 * waiting on is not a different kind of thing, it's a task whose next move
 * belongs to someone else. What it adds is the two numbers you can't see from
 * a task list: how long it's been sitting, and when you last chased it.
 */
export default function Waiting() {
    const toast = useToast()
    const today = todayKey()

    const [tasks, setTasks] = useState<WorkTask[]>([])
    const [projects, setProjects] = useState<WorkProject[]>([])
    const [people, setPeople] = useState<Person[]>([])
    const [loading, setLoading] = useState(true)

    const [newPerson, setNewPerson] = useState<string | null>(null)
    const [newTitle, setNewTitle] = useState('')
    const [saving, setSaving] = useState(false)

    const drawer = useTaskDrawer()
    const [pendingDelete, setPendingDelete] = useState<WorkTask | null>(null)

    useEffect(() => {
        Promise.all([listTasks('open'), listProjects(), listPeople()])
            .then(([t, p, ppl]) => {
                setTasks(t)
                setProjects(p)
                setPeople(ppl)
            })
            .catch(() => toast.error('Could not load what you are waiting on'))
            .finally(() => setLoading(false))
    }, [toast])

    const projectsById = useMemo(() => new Map(projects.map((p) => [p._id, p])), [projects])
    const peopleById = useMemo(() => new Map(people.map((p) => [p._id, p])), [people])
    const nameById = useMemo(() => new Map(people.map((p) => [p._id, p.name])), [people])

    const blocked = useMemo(() => tasks.filter((t) => t.status === 'waiting'), [tasks])
    const groups = useMemo(
        () => groupByPerson(blocked, nameById, today),
        [blocked, nameById, today]
    )
    const chaseCount = blocked.filter((t) => needsChase(t, today)).length

    function replaceTask(updated: WorkTask) {
        setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)))
    }

    async function patchTask(task: WorkTask, patch: Partial<WorkTaskInput>) {
        const previous = task
        setTasks((prev) =>
            prev.map((t) => (t._id === task._id ? ({ ...t, ...patch } as WorkTask) : t))
        )
        try {
            replaceTask(await updateTask(task._id, patch))
        } catch {
            replaceTask(previous)
            toast.error('That change did not save')
        }
    }

    async function chase(task: WorkTask) {
        // Optimistic so the "chased today" line updates under the click.
        setTasks((prev) =>
            prev.map((t) => (t._id === task._id ? { ...t, nudgedAt: today } : t))
        )
        try {
            replaceTask(await nudgeTask(task._id))
        } catch {
            replaceTask(task)
            toast.error('Could not record that chase')
        }
    }

    async function addWaiting(e: FormEvent) {
        e.preventDefault()
        const title = newTitle.trim()
        if (!title || saving) return
        setSaving(true)
        try {
            const created = await createTask({
                title,
                status: 'waiting',
                waitingOn: newPerson,
            })
            setTasks((prev) => [created, ...prev])
            setNewTitle('')
        } catch {
            toast.error('Could not add that')
        } finally {
            setSaving(false)
        }
    }

    async function handleCreatePerson(name: string): Promise<Person | null> {
        try {
            const created = await createPerson({ name })
            setPeople((prev) =>
                prev.some((p) => p._id === created._id)
                    ? prev
                    : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
            )
            return created
        } catch {
            toast.error('Could not add that person')
            return null
        }
    }

    async function handleCreateProject(name: string): Promise<WorkProject | null> {
        try {
            const created = await createProject({ name })
            setProjects((prev) => [created, ...prev])
            return created
        } catch {
            toast.error('Could not create that project')
            return null
        }
    }

    async function confirmDelete() {
        const task = pendingDelete
        if (!task) return
        setPendingDelete(null)
        if (drawer.id === task._id) drawer.close()
        setTasks((prev) => prev.filter((t) => t._id !== task._id))
        try {
            await deleteTaskRequest(task._id)
        } catch {
            setTasks((prev) => [task, ...prev])
            toast.error('Could not delete that')
        }
    }

    const peopleOptions: RefOption[] = people.map((p) => ({
        id: p._id,
        label: p.name,
        hint: p.role,
    }))
    const openTask = tasks.find((t) => t._id === drawer.id) ?? null

    return (
        <Container as="main" className="py-10">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                    Waiting On
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                    {blocked.length === 0
                        ? 'Nothing is blocked on anyone else.'
                        : `${blocked.length} item${blocked.length === 1 ? '' : 's'} blocked${
                              chaseCount > 0 ? ` · ${chaseCount} worth chasing` : ''
                          }`}
                </p>
            </header>

            <form
                onSubmit={addWaiting}
                className="mb-6 rounded-3xl bg-white p-2 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow focus-within:ring-brand-200"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marigold-50 text-amber-700">
                        <i className="fa-solid fa-hourglass-half text-sm" aria-hidden="true" />
                    </span>
                    <input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="What are you waiting for?"
                        aria-label="What are you waiting for?"
                        className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
                    />
                    <RefPicker
                        size="sm"
                        align="right"
                        options={peopleOptions}
                        value={newPerson}
                        onChange={setNewPerson}
                        onCreate={async (name) => {
                            const person = await handleCreatePerson(name)
                            return person ? { id: person._id, label: person.name } : null
                        }}
                        createLabel="Add"
                        placeholder="Who owes it?"
                        clearLabel="Nobody"
                        icon="fa-solid fa-user"
                    />
                    {newTitle.trim() && (
                        <button
                            type="submit"
                            disabled={saving}
                            className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
                        >
                            {saving ? 'Adding…' : 'Add'}
                        </button>
                    )}
                </div>
            </form>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : groups.length === 0 ? (
                <div className="rounded-3xl bg-white ring-1 ring-black/[0.06]">
                    <EmptyState
                        icon="fa-solid fa-hourglass-half"
                        title="Nothing blocked"
                        description="When a task is stuck on someone else, park it here so it stops taking up space in your head."
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {groups.map((group) => {
                        const person = group.key === 'unassigned' ? null : peopleById.get(group.key)
                        const tone = TONE_CLASSES[waitTone(group.oldestDays)]
                        return (
                            <section
                                key={group.key}
                                className="rounded-3xl bg-white p-2 ring-1 ring-black/[0.06]"
                            >
                                <header className="flex items-center gap-3 px-2 pb-1 pt-2">
                                    {person ? (
                                        <Avatar name={person.name} size="sm" />
                                    ) : (
                                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-400">
                                            <i className="fa-solid fa-question text-xs" aria-hidden="true" />
                                        </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <h2 className="truncate text-sm font-bold tracking-tight text-neutral-900">
                                            {group.label}
                                        </h2>
                                        {person?.role && (
                                            <p className="truncate text-xs text-neutral-400">
                                                {person.role}
                                                {person.team ? ` · ${person.team}` : ''}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`shrink-0 text-xs font-semibold ${tone.text}`}>
                                        oldest {group.oldestDays}d
                                    </span>
                                </header>

                                <ul>
                                    {group.tasks.map((task) => (
                                        <WaitingRow
                                            key={task._id}
                                            task={task}
                                            project={task.project ? projectsById.get(task.project) : undefined}
                                            today={today}
                                            onOpen={(t) => drawer.openTask(t._id)}
                                            onChase={chase}
                                            onUnblock={(t) => void patchTask(t, { status: 'todo' })}
                                            onComplete={(t) => void patchTask(t, { status: 'done' })}
                                            onDelete={setPendingDelete}
                                        />
                                    ))}
                                </ul>
                            </section>
                        )
                    })}
                </div>
            )}

            <TaskDrawer
                task={openTask}
                open={drawer.open}
                onClose={drawer.close}
                projects={projects}
                people={people}
                today={today}
                onSave={async (id, patch) => {
                    const current = tasks.find((t) => t._id === id)
                    if (current) await patchTask(current, patch)
                }}
                onDelete={setPendingDelete}
                onCreateProject={handleCreateProject}
                onCreatePerson={handleCreatePerson}
            />

            <ConfirmModal
                open={pendingDelete !== null}
                title="Delete item"
                message={
                    <>
                        Delete <strong>{pendingDelete?.title}</strong>? This can’t be undone.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDelete}
                onClose={() => setPendingDelete(null)}
            />
        </Container>
    )
}
