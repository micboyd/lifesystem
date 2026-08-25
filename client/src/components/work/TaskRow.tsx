import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import { dueBucket, dueLabel, PROJECT_COLORS } from '../../lib/work'
import type { WorkProject, WorkTask, WorkTaskStatus } from '../../types'

interface TaskRowProps {
    task: WorkTask
    project?: WorkProject
    /** Name of whoever owes it, when the task is blocked. */
    personName?: string
    today: string
    onOpen: (task: WorkTask) => void
    onToggleDone: (task: WorkTask) => void
    onSetStatus: (task: WorkTask, status: WorkTaskStatus) => void
    onDelete: (task: WorkTask) => void
    /**
     * Set while a task is in its post-tick grace period — it stays in place,
     * struck through, with an undo, instead of vanishing under the filter.
     */
    justCompleted?: boolean
}

const DUE_TONE: Record<string, string> = {
    overdue: 'bg-red-50 text-red-600',
    today: 'bg-marigold-50 text-amber-700',
    tomorrow: 'bg-neutral-100 text-neutral-600',
    week: 'bg-neutral-100 text-neutral-500',
    later: 'bg-neutral-100 text-neutral-400',
}

/**
 * One line of a task list.
 *
 * The whole row opens the task, but the tick and the menu stop short of it —
 * completing something is the action you take most, and it should never cost
 * you a drawer you then have to close.
 */
export default function TaskRow({
    task,
    project,
    personName,
    today,
    onOpen,
    onToggleDone,
    onSetStatus,
    onDelete,
    justCompleted = false,
}: TaskRowProps) {
    const done = task.status === 'done'
    const bucket = task.dueDate ? dueBucket(task.dueDate, today) : null

    const menu: MenuEntry[] = [
        task.status === 'doing'
            ? { label: 'Stop working on it', icon: 'fa-solid fa-pause', onClick: () => onSetStatus(task, 'todo') }
            : { label: 'Start working on it', icon: 'fa-solid fa-play', onClick: () => onSetStatus(task, 'doing') },
        task.status === 'waiting'
            ? { label: 'Unblock', icon: 'fa-solid fa-lock-open', onClick: () => onSetStatus(task, 'todo') }
            : { label: 'Waiting on someone', icon: 'fa-solid fa-hourglass-half', onClick: () => onSetStatus(task, 'waiting') },
        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: () => onOpen(task) },
        'divider',
        { label: 'Delete', icon: 'fa-solid fa-trash', onClick: () => onDelete(task), danger: true },
    ]

    return (
        <li
            className={`group flex items-start gap-3 rounded-2xl px-2 py-2 transition-colors duration-150 hover:bg-neutral-50 ${done ? 'opacity-60' : ''}`}
        >
            <button
                type="button"
                onClick={() => onToggleDone(task)}
                aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                aria-pressed={done}
                className={[
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-150',
                    done
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-neutral-300 text-transparent hover:border-brand-500 hover:text-brand-500',
                ].join(' ')}
            >
                <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
            </button>

            <button
                type="button"
                onClick={() => onOpen(task)}
                className="min-w-0 flex-1 text-left"
            >
                <span
                    className={[
                        'block text-sm leading-snug',
                        done ? 'text-neutral-400 line-through' : 'text-neutral-900',
                        task.priority === 'high' && !done ? 'font-semibold' : 'font-medium',
                    ].join(' ')}
                >
                    {task.priority === 'high' && !done && (
                        <i
                            className="fa-solid fa-flag mr-1.5 text-[10px] text-red-500"
                            aria-label="High priority"
                        />
                    )}
                    {task.title}
                </span>

                {(project || bucket || task.status === 'waiting' || task.status === 'doing' || task.notes) && (
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {task.status === 'doing' && !done && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                                <i className="fa-solid fa-play text-[8px]" aria-hidden="true" />
                                In progress
                            </span>
                        )}

                        {task.status === 'waiting' && !done && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-marigold-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                <i className="fa-solid fa-hourglass-half text-[8px]" aria-hidden="true" />
                                {personName ? `Waiting on ${personName}` : 'Waiting'}
                            </span>
                        )}

                        {project && (
                            <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PROJECT_COLORS[project.color].chip}`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${PROJECT_COLORS[project.color].dot}`} />
                                {project.name}
                            </span>
                        )}

                        {bucket && !done && (
                            <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DUE_TONE[bucket] ?? 'bg-neutral-100 text-neutral-500'}`}
                            >
                                <i className="fa-regular fa-calendar text-[8px]" aria-hidden="true" />
                                {dueLabel(task.dueDate!, today)}
                            </span>
                        )}

                        {task.notes && (
                            <i
                                className="fa-solid fa-align-left text-[10px] text-neutral-300"
                                aria-label="Has notes"
                            />
                        )}
                    </span>
                )}
            </button>

            {justCompleted ? (
                <button
                    type="button"
                    onClick={() => onToggleDone(task)}
                    className="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50"
                >
                    Undo
                </button>
            ) : (
                <DropdownMenu
                    align="right"
                    items={menu}
                    className="mt-0.5 shrink-0"
                    trigger={
                        <span
                            role="button"
                            aria-label={`Actions for ${task.title}`}
                            // Always reachable on touch, where there is no hover to reveal it.
                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-200/70 hover:text-neutral-700 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                            <i className="fa-solid fa-ellipsis-vertical text-xs" aria-hidden="true" />
                        </span>
                    }
                />
            )}
        </li>
    )
}
