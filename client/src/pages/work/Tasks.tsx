import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../../components/Container'
import Spinner from '../../components/Spinner'
import Tabs from '../../components/Tabs'
import EmptyState from '../../components/EmptyState'
import ConfirmModal from '../../components/ConfirmModal'
import TaskComposer from '../../components/work/TaskComposer'
import TaskRow from '../../components/work/TaskRow'
import TaskDrawer from '../../components/work/TaskDrawer'
import { useTaskDrawer } from '../../components/work/useTaskDrawer'
import { useToast } from '../../context/ToastContext'
import { todayKey } from '../../lib/calendar'
import { dueBucket, groupByDue, groupByProject, type TaskGroup } from '../../lib/work'
import {
    createTask,
    deleteTask as deleteTaskRequest,
    listTasks,
    updateTask,
    type WorkTaskInput,
} from '../../services/workTasks'
import { createProject, listProjects } from '../../services/workProjects'
import { createPerson, listPeople } from '../../services/people'
import type { Person, WorkProject, WorkTask, WorkTaskStatus } from '../../types'

type Filter = 'Open' | 'Doing' | 'Waiting' | 'Done'
const FILTERS: Filter[] = ['Open', 'Doing', 'Waiting', 'Done']

/** How long a just-ticked task stays put, struck through, before it filters out. */
const COMPLETION_GRACE = 6000

function matchesFilter(task: WorkTask, filter: Filter): boolean {
    if (filter === 'Open') return task.status !== 'done'
    if (filter === 'Doing') return task.status === 'doing'
    if (filter === 'Waiting') return task.status === 'waiting'
    return task.status === 'done'
}

export default function Tasks() {
    const toast = useToast()
    const today = todayKey()

    const [tasks, setTasks] = useState<WorkTask[]>([])
    const [projects, setProjects] = useState<WorkProject[]>([])
    const [people, setPeople] = useState<Person[]>([])
    const [loading, setLoading] = useState(true)

    const [filter, setFilter] = useState<Filter>('Open')
    const [grouping, setGrouping] = useState<'due' | 'project'>('due')
    const [search, setSearch] = useState('')

    const drawer = useTaskDrawer()
    const [pendingDelete, setPendingDelete] = useState<WorkTask | null>(null)

    // Ticked-off tasks linger briefly so the list doesn't twitch out from under
    // the click that completed them, and so "undo" has somewhere to live.
    const [recentlyDone, setRecentlyDone] = useState<string[]>([])
    const graceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    useEffect(() => {
        Promise.all([listTasks('recent'), listProjects(), listPeople()])
            .then(([t, p, ppl]) => {
                setTasks(t)
                setProjects(p)
                setPeople(ppl)
            })
            .catch(() => toast.error('Could not load your tasks'))
            .finally(() => setLoading(false))
    }, [toast])

    useEffect(() => {
        const timers = graceTimers.current
        return () => timers.forEach(clearTimeout)
    }, [])

    const projectsById = useMemo(
        () => new Map(projects.map((p) => [p._id, p])),
        [projects]
    )
    const peopleById = useMemo(() => new Map(people.map((p) => [p._id, p.name])), [people])

    function replaceTask(updated: WorkTask) {
        setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)))
    }

    /**
     * Applies the change locally first and rolls back if the write fails —
     * ticking a task should feel instant, and a failure is rare enough to be
     * worth a toast rather than a spinner on every row.
     */
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

    function holdBriefly(id: string) {
        setRecentlyDone((prev) => (prev.includes(id) ? prev : [...prev, id]))
        clearTimeout(graceTimers.current.get(id))
        graceTimers.current.set(
            id,
            setTimeout(() => {
                setRecentlyDone((prev) => prev.filter((held) => held !== id))
                graceTimers.current.delete(id)
            }, COMPLETION_GRACE)
        )
    }

    function release(id: string) {
        clearTimeout(graceTimers.current.get(id))
        graceTimers.current.delete(id)
        setRecentlyDone((prev) => prev.filter((held) => held !== id))
    }

    async function toggleDone(task: WorkTask) {
        const next: WorkTaskStatus = task.status === 'done' ? 'todo' : 'done'
        if (next === 'done') holdBriefly(task._id)
        else release(task._id)
        await patchTask(task, { status: next })
    }

    async function handleCreate(input: WorkTaskInput) {
        try {
            const created = await createTask(input)
            setTasks((prev) => [created, ...prev])
        } catch {
            toast.error('Could not add that task')
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
            toast.error('Could not delete that task')
        }
    }

    const query = search.trim().toLowerCase()
    const visible = useMemo(() => {
        const held = new Set(recentlyDone)
        return tasks.filter((task) => {
            if (!matchesFilter(task, filter) && !held.has(task._id)) return false
            if (!query) return true
            return [task.title, task.notes, task.source]
                .filter(Boolean)
                .some((field) => field!.toLowerCase().includes(query))
        })
    }, [tasks, filter, query, recentlyDone])

    const groups: TaskGroup[] = useMemo(() => {
        // A finished task's due date has stopped meaning anything — grouping
        // the Done list by it files completed work under "Overdue".
        if (filter === 'Done') {
            const done = [...visible].sort((a, b) =>
                (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
            )
            return done.length ? [{ key: 'done', label: 'Recently completed', tasks: done }] : []
        }
        return grouping === 'due'
            ? groupByDue(visible, today)
            : groupByProject(visible, projects)
    }, [visible, grouping, projects, today, filter])

    const openTasks = tasks.filter((t) => t.status !== 'done')
    const overdue = openTasks.filter((t) => dueBucket(t.dueDate, today) === 'overdue').length
    const waiting = openTasks.filter((t) => t.status === 'waiting').length
    const openTask = tasks.find((t) => t._id === drawer.id) ?? null

    return (
        <Container as="main" className="py-10">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                        Tasks
                    </h1>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                        {overdue > 0 && (
                            <>
                                <span className="font-semibold text-red-600">{overdue} overdue</span>
                                <span aria-hidden="true">·</span>
                            </>
                        )}
                        <span>
                            {openTasks.length} open task{openTasks.length === 1 ? '' : 's'}
                        </span>
                        {waiting > 0 && (
                            <>
                                <span aria-hidden="true">·</span>
                                <Link
                                    to="/work/waiting"
                                    className="font-semibold text-amber-700 underline-offset-2 hover:underline"
                                >
                                    {waiting} waiting on someone
                                </Link>
                            </>
                        )}
                    </p>
                </div>

                <div
                    className={`flex items-center gap-1 rounded-full bg-neutral-200/80 p-1 ring-1 ring-black/[0.04] transition-opacity ${filter === 'Done' ? 'pointer-events-none opacity-40' : ''}`}
                >
                    {(['due', 'project'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setGrouping(mode)}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-200 ${
                                grouping === mode
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-900'
                            }`}
                        >
                            By {mode}
                        </button>
                    ))}
                </div>
            </header>

            <div className="mb-5">
                <TaskComposer
                    projects={projects}
                    today={today}
                    onCreate={handleCreate}
                    onCreateProject={handleCreateProject}
                />
            </div>

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <Tabs tabs={FILTERS} value={filter} onChange={(f) => setFilter(f as Filter)} />
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-neutral-300">
                        <i className="fa-solid fa-magnifying-glass text-xs" aria-hidden="true" />
                    </span>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search tasks"
                        aria-label="Search tasks"
                        className="w-full rounded-full border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                    />
                </div>
            </div>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : groups.length === 0 ? (
                <div className="rounded-3xl bg-white ring-1 ring-black/[0.06]">
                    <EmptyState
                        icon="fa-solid fa-list-check"
                        title={
                            query
                                ? 'Nothing matches that'
                                : filter === 'Open'
                                  ? tasks.length === 0
                                      ? 'No tasks yet'
                                      : 'All clear'
                                  : `Nothing ${filter.toLowerCase()}`
                        }
                        description={
                            query
                                ? 'Try a shorter search, or a different filter.'
                                : filter === 'Open'
                                  ? tasks.length === 0
                                      ? 'Capture the first one in the box above — a project and a date are optional.'
                                      : 'Everything open is done. Enjoy it while it lasts.'
                                  : undefined
                        }
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {groups.map((group) => (
                        <section key={group.key}>
                            <h2 className="mb-1.5 flex items-baseline gap-2 px-2">
                                <span
                                    className={`text-xs font-semibold uppercase tracking-wide ${
                                        group.key === 'overdue' ? 'text-red-600' : 'text-neutral-400'
                                    }`}
                                >
                                    {group.label}
                                </span>
                                <span className="text-xs font-medium text-neutral-300">
                                    {group.tasks.length}
                                </span>
                            </h2>
                            <ul className="rounded-3xl bg-white p-2 ring-1 ring-black/[0.06]">
                                {group.tasks.map((task) => (
                                    <TaskRow
                                        key={task._id}
                                        task={task}
                                        project={task.project ? projectsById.get(task.project) : undefined}
                                        personName={
                                            task.waitingOn ? peopleById.get(task.waitingOn) : undefined
                                        }
                                        today={today}
                                        justCompleted={recentlyDone.includes(task._id)}
                                        onOpen={(t) => drawer.openTask(t._id)}
                                        onToggleDone={toggleDone}
                                        onSetStatus={(t, status) => void patchTask(t, { status })}
                                        onDelete={setPendingDelete}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}
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
                title="Delete task"
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
