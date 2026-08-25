import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Container from '../../components/Container'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Spinner from '../../components/Spinner'
import Tabs from '../../components/Tabs'
import EmptyState from '../../components/EmptyState'
import ConfirmModal from '../../components/ConfirmModal'
import DropdownMenu, { type MenuEntry } from '../../components/DropdownMenu'
import TaskComposer from '../../components/work/TaskComposer'
import TaskRow from '../../components/work/TaskRow'
import TaskDrawer from '../../components/work/TaskDrawer'
import { useTaskDrawer } from '../../components/work/useTaskDrawer'
import { useToast } from '../../context/ToastContext'
import { todayKey } from '../../lib/calendar'
import {
    dueLabel,
    isStateStale,
    PROJECT_COLORS,
    sortTasks,
    stateAgeLabel,
} from '../../lib/work'
import {
    createProject,
    deleteProject as deleteProjectRequest,
    listProjects,
    updateProject,
    type WorkProjectInput,
} from '../../services/workProjects'
import {
    createTask,
    deleteTask as deleteTaskRequest,
    listTasks,
    updateTask,
    type WorkTaskInput,
} from '../../services/workTasks'
import { createPerson, listPeople } from '../../services/people'
import {
    WORK_PROJECT_COLORS,
    type Person,
    type WorkProject,
    type WorkProjectColor,
    type WorkProjectStatus,
    type WorkTask,
} from '../../types'

type Filter = 'Active' | 'Paused' | 'Done' | 'All'
const FILTERS: Filter[] = ['Active', 'Paused', 'Done', 'All']

const STATUS_BADGE: Record<WorkProjectStatus, string> = {
    active: 'bg-herb/15 text-herb',
    paused: 'bg-marigold-50 text-amber-700',
    done: 'bg-brand-50 text-brand-700',
    archived: 'bg-neutral-100 text-neutral-500',
}

const STATUS_LABEL: Record<WorkProjectStatus, string> = {
    active: 'Active',
    paused: 'Paused',
    done: 'Done',
    archived: 'Archived',
}

function ColorPicker({
    value,
    onChange,
}: {
    value: WorkProjectColor
    onChange: (color: WorkProjectColor) => void
}) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {WORK_PROJECT_COLORS.map((color) => (
                <button
                    key={color}
                    type="button"
                    onClick={() => onChange(color)}
                    aria-label={color}
                    aria-pressed={color === value}
                    className={`h-6 w-6 rounded-full transition-transform duration-150 ${PROJECT_COLORS[color].dot} ${
                        color === value
                            ? 'ring-2 ring-neutral-900 ring-offset-2'
                            : 'hover:scale-110'
                    }`}
                />
            ))}
        </div>
    )
}

/**
 * The status line, edited where it's read.
 *
 * "Where is this up to" changes far more often than a project's name or dates,
 * so it gets to be a click rather than a trip through an edit dialog — and the
 * age beside it is the whole point of keeping it separate from the summary.
 */
function StateEditor({
    project,
    today,
    onSave,
}: {
    project: WorkProject
    today: string
    onSave: (state: string) => Promise<void>
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(project.state ?? '')
    const ref = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (editing) ref.current?.focus()
    }, [editing])

    const stale = isStateStale(project, today)

    async function commit() {
        setEditing(false)
        if (draft.trim() === (project.state ?? '')) return
        await onSave(draft.trim())
    }

    if (editing) {
        return (
            <textarea
                ref={ref}
                value={draft}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void commit()
                    }
                    if (e.key === 'Escape') {
                        setDraft(project.state ?? '')
                        setEditing(false)
                    }
                }}
                placeholder="Where is this up to?"
                className="w-full resize-none rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-800 outline-none focus:ring-2 focus:ring-neutral-200"
            />
        )
    }

    return (
        <button
            type="button"
            onClick={() => {
                setDraft(project.state ?? '')
                setEditing(true)
            }}
            className={`w-full rounded-2xl px-3 py-2 text-left transition-colors ${
                stale ? 'bg-marigold-50/70 hover:bg-marigold-50' : 'bg-neutral-50 hover:bg-neutral-100'
            }`}
        >
            <span
                className={`block text-sm leading-relaxed ${project.state ? 'text-neutral-800' : 'text-neutral-400'}`}
            >
                {project.state || 'Where is this up to?'}
            </span>
            <span
                className={`mt-1 block text-[11px] font-medium ${stale ? 'text-amber-700' : 'text-neutral-400'}`}
            >
                {stateAgeLabel(project, today)}
                {stale && ' · worth a fresh look'}
            </span>
        </button>
    )
}

interface ProjectCardProps {
    project: WorkProject
    tasks: WorkTask[]
    people: Person[]
    projects: WorkProject[]
    today: string
    expanded: boolean
    onToggleExpand: () => void
    onPatch: (patch: Partial<WorkProjectInput>) => Promise<void>
    onEdit: () => void
    onDelete: () => void
    onCreateTask: (input: WorkTaskInput) => Promise<void>
    onOpenTask: (task: WorkTask) => void
    onToggleTaskDone: (task: WorkTask) => void
    onSetTaskStatus: (task: WorkTask, status: WorkTask['status']) => void
    onDeleteTask: (task: WorkTask) => void
    onCreateProject: (name: string) => Promise<WorkProject | null>
}

function ProjectCard({
    project,
    tasks,
    people,
    projects,
    today,
    expanded,
    onToggleExpand,
    onPatch,
    onEdit,
    onDelete,
    onCreateTask,
    onOpenTask,
    onToggleTaskDone,
    onSetTaskStatus,
    onDeleteTask,
    onCreateProject,
}: ProjectCardProps) {
    const { stats } = project
    const peopleById = useMemo(() => new Map(people.map((p) => [p._id, p.name])), [people])
    const open = useMemo(() => sortTasks(tasks.filter((t) => t.status !== 'done')), [tasks])

    const statusItems: MenuEntry[] = (['active', 'paused', 'done', 'archived'] as const)
        .filter((s) => s !== project.status)
        .map((s) => ({
            label: `Mark ${STATUS_LABEL[s].toLowerCase()}`,
            icon:
                s === 'active'
                    ? 'fa-solid fa-play'
                    : s === 'paused'
                      ? 'fa-solid fa-pause'
                      : s === 'done'
                        ? 'fa-solid fa-check'
                        : 'fa-solid fa-box-archive',
            onClick: () => void onPatch({ status: s }),
        }))

    return (
        <article className="rounded-3xl bg-white p-4 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
            <header className="flex items-start gap-3">
                <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PROJECT_COLORS[project.color].dot}`}
                />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold tracking-tight text-neutral-900">
                            {project.name}
                        </h2>
                        <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[project.status]}`}
                        >
                            {STATUS_LABEL[project.status]}
                        </span>
                    </div>
                    {project.summary && (
                        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                            {project.summary}
                        </p>
                    )}
                </div>

                <DropdownMenu
                    align="right"
                    className="shrink-0"
                    items={[
                        { label: 'Edit project', icon: 'fa-solid fa-pen', onClick: onEdit },
                        ...statusItems,
                        'divider',
                        { label: 'Delete', icon: 'fa-solid fa-trash', onClick: onDelete, danger: true },
                    ]}
                    trigger={
                        <span
                            role="button"
                            aria-label={`Actions for ${project.name}`}
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <i className="fa-solid fa-ellipsis-vertical text-sm" aria-hidden="true" />
                        </span>
                    }
                />
            </header>

            <div className="mt-3">
                <StateEditor project={project} today={today} onSave={(state) => onPatch({ state })} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                <span className="font-semibold text-neutral-700">
                    {stats.open} open
                </span>
                {stats.waiting > 0 && <span className="text-amber-700">{stats.waiting} waiting</span>}
                {stats.overdue > 0 && (
                    <span className="font-semibold text-red-600">{stats.overdue} overdue</span>
                )}
                {stats.done > 0 && <span>{stats.done} done</span>}
                {stats.nextDue && <span>Next {dueLabel(stats.nextDue, today).toLowerCase()}</span>}
            </div>

            <button
                type="button"
                onClick={onToggleExpand}
                className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
            >
                <i
                    className={`fa-solid fa-chevron-right text-[10px] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                />
                {expanded ? 'Hide tasks' : `Show tasks${stats.open ? ` (${stats.open})` : ''}`}
            </button>

            {expanded && (
                <div className="mt-3 border-t border-neutral-100 pt-3">
                    <TaskComposer
                        projects={projects}
                        today={today}
                        onCreate={onCreateTask}
                        onCreateProject={onCreateProject}
                        lockedProject={project._id}
                        placeholder={`Add a task to ${project.name}…`}
                    />
                    {open.length === 0 ? (
                        <p className="px-2 py-4 text-center text-sm text-neutral-400">
                            Nothing open on this one.
                        </p>
                    ) : (
                        <ul className="mt-2">
                            {open.map((task) => (
                                <TaskRow
                                    key={task._id}
                                    task={task}
                                    personName={
                                        task.waitingOn ? peopleById.get(task.waitingOn) : undefined
                                    }
                                    today={today}
                                    onOpen={onOpenTask}
                                    onToggleDone={onToggleTaskDone}
                                    onSetStatus={onSetTaskStatus}
                                    onDelete={onDeleteTask}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </article>
    )
}

export default function Projects() {
    const toast = useToast()
    const today = todayKey()

    const [projects, setProjects] = useState<WorkProject[]>([])
    const [tasks, setTasks] = useState<WorkTask[]>([])
    const [people, setPeople] = useState<Person[]>([])
    const [loading, setLoading] = useState(true)

    const [filter, setFilter] = useState<Filter>('Active')
    const [expanded, setExpanded] = useState<string | null>(null)
    const drawer = useTaskDrawer()
    const [pendingDeleteTask, setPendingDeleteTask] = useState<WorkTask | null>(null)
    const [pendingDeleteProject, setPendingDeleteProject] = useState<WorkProject | null>(null)

    // The composer doubles as the editor: `editing` null means a new project.
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<WorkProject | null>(null)
    const [name, setName] = useState('')
    const [summary, setSummary] = useState('')
    const [color, setColor] = useState<WorkProjectColor>('slate')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        Promise.all([listProjects(), listTasks('open'), listPeople()])
            .then(([p, t, ppl]) => {
                setProjects(p)
                setTasks(t)
                setPeople(ppl)
            })
            .catch(() => toast.error('Could not load your projects'))
            .finally(() => setLoading(false))
    }, [toast])

    function replaceProject(updated: WorkProject) {
        setProjects((prev) => prev.map((p) => (p._id === updated._id ? updated : p)))
    }

    async function patchProject(project: WorkProject, patch: Partial<WorkProjectInput>) {
        const previous = project
        setProjects((prev) =>
            prev.map((p) => (p._id === project._id ? ({ ...p, ...patch } as WorkProject) : p))
        )
        try {
            replaceProject(await updateProject(project._id, patch))
        } catch {
            replaceProject(previous)
            toast.error('That change did not save')
        }
    }

    async function patchTask(task: WorkTask, patch: Partial<WorkTaskInput>) {
        const previous = task
        setTasks((prev) =>
            prev.map((t) => (t._id === task._id ? ({ ...t, ...patch } as WorkTask) : t))
        )
        try {
            const updated = await updateTask(task._id, patch)
            setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)))
            // Counts on the cards come from the server, so a status change has
            // to go back for them rather than being guessed at here.
            setProjects(await listProjects())
        } catch {
            setTasks((prev) => prev.map((t) => (t._id === previous._id ? previous : t)))
            toast.error('That change did not save')
        }
    }

    function openForm(project: WorkProject | null) {
        setEditing(project)
        setName(project?.name ?? '')
        setSummary(project?.summary ?? '')
        setColor(project?.color ?? 'slate')
        setFormOpen(true)
    }

    async function submitForm(e: FormEvent) {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || saving) return
        setSaving(true)
        try {
            if (editing) {
                replaceProject(
                    await updateProject(editing._id, {
                        name: trimmed,
                        summary: summary.trim(),
                        color,
                    })
                )
            } else {
                const created = await createProject({
                    name: trimmed,
                    summary: summary.trim() || undefined,
                    color,
                })
                setProjects((prev) => [created, ...prev])
                setExpanded(created._id)
            }
            setFormOpen(false)
            setEditing(null)
        } catch {
            toast.error('Could not save that project')
        } finally {
            setSaving(false)
        }
    }

    async function handleCreateTask(input: WorkTaskInput) {
        try {
            const created = await createTask(input)
            setTasks((prev) => [created, ...prev])
            setProjects(await listProjects())
        } catch {
            toast.error('Could not add that task')
        }
    }

    async function handleCreateProject(newName: string): Promise<WorkProject | null> {
        try {
            const created = await createProject({ name: newName })
            setProjects((prev) => [created, ...prev])
            return created
        } catch {
            toast.error('Could not create that project')
            return null
        }
    }

    async function handleCreatePerson(personName: string): Promise<Person | null> {
        try {
            const created = await createPerson({ name: personName })
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

    async function confirmDeleteTask() {
        const task = pendingDeleteTask
        if (!task) return
        setPendingDeleteTask(null)
        if (drawer.id === task._id) drawer.close()
        setTasks((prev) => prev.filter((t) => t._id !== task._id))
        try {
            await deleteTaskRequest(task._id)
            setProjects(await listProjects())
        } catch {
            setTasks((prev) => [task, ...prev])
            toast.error('Could not delete that task')
        }
    }

    async function confirmDeleteProject() {
        const project = pendingDeleteProject
        if (!project) return
        setPendingDeleteProject(null)
        try {
            const { detachedTasks } = await deleteProjectRequest(project._id)
            setProjects((prev) => prev.filter((p) => p._id !== project._id))
            setTasks((prev) =>
                prev.map((t) => (t.project === project._id ? { ...t, project: null } : t))
            )
            if (detachedTasks > 0) {
                toast.show(
                    `${detachedTasks} task${detachedTasks === 1 ? '' : 's'} kept, now unfiled`,
                    'info'
                )
            }
        } catch {
            toast.error('Could not delete that project')
        }
    }

    const visible = useMemo(() => {
        if (filter === 'All') return projects
        const wanted: WorkProjectStatus = filter.toLowerCase() as WorkProjectStatus
        return projects.filter((p) => p.status === wanted)
    }, [projects, filter])

    const activeCount = projects.filter((p) => p.status === 'active').length
    const staleCount = projects.filter((p) => isStateStale(p, today)).length
    const openTask = tasks.find((t) => t._id === drawer.id) ?? null

    return (
        <Container as="main" className="py-10">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                        Projects
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {activeCount} active
                        {staleCount > 0 && (
                            <span className="text-amber-700">
                                {' '}
                                · {staleCount} need{staleCount === 1 ? 's' : ''} a status update
                            </span>
                        )}
                    </p>
                </div>
                <Button variant="brand" icon="fa-solid fa-plus" onClick={() => openForm(null)}>
                    New project
                </Button>
            </header>

            {formOpen && (
                <form
                    onSubmit={submitForm}
                    className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-4 ring-1 ring-black/[0.06] sm:p-6"
                >
                    <Input
                        label="Project"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="What's the workstream?"
                        autoFocus
                    />
                    <div className="flex flex-col gap-1.5">
                        <label
                            htmlFor="project-summary"
                            className="text-xs font-semibold uppercase tracking-wide text-neutral-400"
                        >
                            What it is (optional)
                        </label>
                        <textarea
                            id="project-summary"
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            rows={2}
                            placeholder="The stable description — where it's up to goes on the card."
                            className="resize-none rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Colour
                        </span>
                        <ColorPicker value={color} onChange={setColor} />
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" variant="brand" disabled={saving || !name.trim()}>
                            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setFormOpen(false)
                                setEditing(null)
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            )}

            <Tabs
                tabs={FILTERS}
                value={filter}
                onChange={(f) => setFilter(f as Filter)}
                className="mb-5"
            />

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : visible.length === 0 ? (
                <div className="rounded-3xl bg-white ring-1 ring-black/[0.06]">
                    <EmptyState
                        icon="fa-solid fa-diagram-project"
                        title={projects.length === 0 ? 'No projects yet' : `No ${filter.toLowerCase()} projects`}
                        description={
                            projects.length === 0
                                ? 'A project is anything bigger than a task and smaller than a job title. Tasks can hang off it once it exists.'
                                : undefined
                        }
                        action={
                            projects.length === 0 ? (
                                <Button variant="brand" icon="fa-solid fa-plus" onClick={() => openForm(null)}>
                                    New project
                                </Button>
                            ) : undefined
                        }
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {visible.map((project) => (
                        <ProjectCard
                            key={project._id}
                            project={project}
                            projects={projects}
                            people={people}
                            tasks={tasks.filter((t) => t.project === project._id)}
                            today={today}
                            expanded={expanded === project._id}
                            onToggleExpand={() =>
                                setExpanded((id) => (id === project._id ? null : project._id))
                            }
                            onPatch={(patch) => patchProject(project, patch)}
                            onEdit={() => openForm(project)}
                            onDelete={() => setPendingDeleteProject(project)}
                            onCreateTask={handleCreateTask}
                            onOpenTask={(t) => drawer.openTask(t._id)}
                            onToggleTaskDone={(t) =>
                                void patchTask(t, { status: t.status === 'done' ? 'todo' : 'done' })
                            }
                            onSetTaskStatus={(t, status) => void patchTask(t, { status })}
                            onDeleteTask={setPendingDeleteTask}
                            onCreateProject={handleCreateProject}
                        />
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
                onDelete={setPendingDeleteTask}
                onCreateProject={handleCreateProject}
                onCreatePerson={handleCreatePerson}
            />

            <ConfirmModal
                open={pendingDeleteTask !== null}
                title="Delete task"
                message={
                    <>
                        Delete <strong>{pendingDeleteTask?.title}</strong>? This can’t be undone.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDeleteTask}
                onClose={() => setPendingDeleteTask(null)}
            />

            <ConfirmModal
                open={pendingDeleteProject !== null}
                title="Delete project"
                message={
                    <>
                        Delete <strong>{pendingDeleteProject?.name}</strong>? Its tasks are kept and
                        become unfiled.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDeleteProject}
                onClose={() => setPendingDeleteProject(null)}
            />
        </Container>
    )
}
