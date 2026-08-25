import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../../components/Container'
import { Card } from '../../components/Card'
import Spinner from '../../components/Spinner'
import { useToast } from '../../context/ToastContext'
import { todayKey } from '../../lib/calendar'
import {
    dueBucket,
    isStateStale,
    needsChase,
    PROJECT_COLORS,
    sortTasks,
    waitingDays,
} from '../../lib/work'
import { listTasks } from '../../services/workTasks'
import { listProjects } from '../../services/workProjects'
import { listPeople } from '../../services/people'
import { WORK_MODULES } from '../../lib/workspace'
import type { Person, WorkProject, WorkTask } from '../../types'

/** "Tuesday, 25 August 2026" */
function today(): string {
    return new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

interface StatCardProps {
    to: string
    icon: string
    label: string
    value: number
    /** The line under the number — the bit that says whether to worry. */
    detail?: string
    tone?: 'neutral' | 'warning' | 'danger'
}

function StatCard({ to, icon, label, value, detail, tone = 'neutral' }: StatCardProps) {
    const detailClass =
        tone === 'danger'
            ? 'text-red-600'
            : tone === 'warning'
              ? 'text-amber-700'
              : 'text-neutral-400'

    return (
        <Link to={to} className="group">
            <Card className="h-full">
                <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-2xl font-bold tracking-tight tabular-nums text-neutral-950">
                            {value}
                        </p>
                        <p className="text-sm font-semibold tracking-tight text-neutral-900">
                            {label}
                        </p>
                        <p className={`mt-0.5 text-xs font-medium ${detailClass}`}>
                            {detail ?? 'All clear'}
                        </p>
                    </div>
                </div>
            </Card>
        </Link>
    )
}

/**
 * The work workspace's landing page.
 *
 * Answers one question — what needs me today — from the modules that exist,
 * and keeps the map of the ones that don't underneath it. The focus list is
 * capped: a dashboard that lists everything is just the task page with worse
 * affordances.
 */
export default function Dashboard() {
    const toast = useToast()
    const day = todayKey()

    const [tasks, setTasks] = useState<WorkTask[]>([])
    const [projects, setProjects] = useState<WorkProject[]>([])
    const [people, setPeople] = useState<Person[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([listTasks('open'), listProjects(), listPeople()])
            .then(([t, p, ppl]) => {
                setTasks(t)
                setProjects(p)
                setPeople(ppl)
            })
            .catch(() => toast.error('Could not load your work'))
            .finally(() => setLoading(false))
    }, [toast])

    const peopleById = useMemo(() => new Map(people.map((p) => [p._id, p.name])), [people])
    const projectsById = useMemo(() => new Map(projects.map((p) => [p._id, p])), [projects])

    const overdue = tasks.filter((t) => dueBucket(t.dueDate, day) === 'overdue')
    const dueToday = tasks.filter((t) => dueBucket(t.dueDate, day) === 'today')
    const inProgress = tasks.filter((t) => t.status === 'doing')
    const waiting = tasks.filter((t) => t.status === 'waiting')
    const toChase = waiting.filter((t) => needsChase(t, day))
    const activeProjects = projects.filter((p) => p.status === 'active')
    const staleProjects = activeProjects.filter((p) => isStateStale(p, day))

    // Overdue first, then today, then whatever is already on the go. A task
    // can qualify twice — an overdue one you've started — so it's deduped by id.
    const ranked = [...sortTasks(overdue), ...sortTasks(dueToday), ...sortTasks(inProgress)]
    const focus = ranked
        .filter((task, index) => ranked.findIndex((other) => other._id === task._id) === index)
        .slice(0, 6)

    const unbuilt = WORK_MODULES.filter((module) => !module.built)

    return (
        <Container as="main" className="py-10">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                    Work
                </h1>
                <p className="mt-1 text-sm text-neutral-500">{today()}</p>
            </header>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : (
                <>
                    <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <StatCard
                            to="/work/tasks"
                            icon="fa-list-check"
                            label="Open tasks"
                            value={tasks.length}
                            tone={overdue.length ? 'danger' : 'neutral'}
                            detail={
                                overdue.length
                                    ? `${overdue.length} overdue`
                                    : dueToday.length
                                      ? `${dueToday.length} due today`
                                      : undefined
                            }
                        />
                        <StatCard
                            to="/work/waiting"
                            icon="fa-hourglass-half"
                            label="Waiting on others"
                            value={waiting.length}
                            tone={toChase.length ? 'warning' : 'neutral'}
                            detail={
                                toChase.length ? `${toChase.length} worth chasing` : 'Nothing stale'
                            }
                        />
                        <StatCard
                            to="/work/projects"
                            icon="fa-diagram-project"
                            label="Active projects"
                            value={activeProjects.length}
                            tone={staleProjects.length ? 'warning' : 'neutral'}
                            detail={
                                staleProjects.length
                                    ? `${staleProjects.length} need a status update`
                                    : 'All up to date'
                            }
                        />
                    </div>

                    <section className="mb-8">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Needs you today
                        </h2>
                        <Card hover={false} flush className="overflow-hidden">
                            {focus.length === 0 ? (
                                <p className="px-6 py-8 text-center text-sm text-neutral-400">
                                    Nothing overdue, due today or in progress.{' '}
                                    <Link
                                        to="/work/tasks"
                                        className="font-semibold text-brand-600 underline-offset-2 hover:underline"
                                    >
                                        Open tasks
                                    </Link>
                                </p>
                            ) : (
                                <ul className="divide-y divide-neutral-100">
                                    {focus.map((task) => {
                                        const project = task.project
                                            ? projectsById.get(task.project)
                                            : undefined
                                        const bucket = dueBucket(task.dueDate, day)
                                        return (
                                            <li key={task._id}>
                                                <Link
                                                    to="/work/tasks"
                                                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 sm:px-6"
                                                >
                                                    <span
                                                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                                            bucket === 'overdue'
                                                                ? 'bg-red-500'
                                                                : bucket === 'today'
                                                                  ? 'bg-marigold'
                                                                  : 'bg-brand-500'
                                                        }`}
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-sm font-medium leading-snug text-neutral-900">
                                                            {task.title}
                                                        </span>
                                                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                                                            <span
                                                                className={
                                                                    bucket === 'overdue'
                                                                        ? 'text-red-600'
                                                                        : bucket === 'today'
                                                                          ? 'text-amber-700'
                                                                          : 'text-brand-600'
                                                                }
                                                            >
                                                                {bucket === 'overdue'
                                                                    ? 'Overdue'
                                                                    : bucket === 'today'
                                                                      ? 'Due today'
                                                                      : 'In progress'}
                                                            </span>
                                                            {project && (
                                                                <span
                                                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${PROJECT_COLORS[project.color].chip}`}
                                                                >
                                                                    <span
                                                                        className={`h-1.5 w-1.5 rounded-full ${PROJECT_COLORS[project.color].dot}`}
                                                                    />
                                                                    {project.name}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </span>
                                                </Link>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </Card>
                    </section>

                    {toChase.length > 0 && (
                        <section className="mb-8">
                            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Worth chasing
                            </h2>
                            <Card hover={false} flush className="overflow-hidden">
                                <ul className="divide-y divide-neutral-100">
                                    {toChase.slice(0, 4).map((task) => (
                                        <li key={task._id}>
                                            <Link
                                                to="/work/waiting"
                                                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 sm:px-6"
                                            >
                                                <span className="shrink-0 rounded-full bg-marigold-50 px-2 py-1 text-[11px] font-bold tabular-nums text-amber-700">
                                                    {waitingDays(task, day)}d
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
                                                    {task.title}
                                                </span>
                                                {task.waitingOn && (
                                                    <span className="shrink-0 text-xs text-neutral-400">
                                                        {peopleById.get(task.waitingOn)}
                                                    </span>
                                                )}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        </section>
                    )}
                </>
            )}

            {unbuilt.length > 0 && (
                <section>
                    <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Still to build
                    </h2>
                    <p className="mb-3 text-sm text-neutral-400">
                        Live routes with nothing behind them yet — the shape of the workspace, so it
                        can be rearranged before any of it is real.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {unbuilt.map(({ label, to, icon, blurb }) => (
                            <Link key={to} to={to} className="group">
                                <Card className="h-full">
                                    <div className="flex items-start gap-3">
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-400 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600">
                                            <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold tracking-tight text-neutral-900">
                                                {label}
                                            </h3>
                                            <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                                                {blurb}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </section>
            )}
        </Container>
    )
}
