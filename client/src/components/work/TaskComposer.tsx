import { useState, type FormEvent } from 'react'
import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import RefPicker, { type RefOption } from './RefPicker'
import { PROJECT_COLORS } from '../../lib/work'
import { addDays, formatDateShort, parseDateKey } from '../../lib/calendar'
import type { WorkTaskInput } from '../../services/workTasks'
import type { WorkProject } from '../../types'

interface TaskComposerProps {
    projects: WorkProject[]
    today: string
    onCreate: (input: WorkTaskInput) => Promise<void>
    onCreateProject: (name: string) => Promise<WorkProject | null>
    /** Fixes every capture to one project — used inside a project's own card. */
    lockedProject?: string
    placeholder?: string
}

/** The Monday after today, so "next week" means the start of it. */
function nextMonday(today: string): string {
    const { year, month, day } = parseDateKey(today)
    const weekday = new Date(year, month, day).getDay()
    return addDays(today, ((8 - weekday) % 7) || 7)
}

/**
 * The capture bar that sits at the top of a task list.
 *
 * Always visible and always one keystroke from ready: work arrives while
 * you're doing something else, and a capture path that starts with "open a
 * modal" is a capture path that doesn't get used. The project and due choices
 * stay put between adds, because tasks arrive in runs about the same thing.
 */
export default function TaskComposer({
    projects,
    today,
    onCreate,
    onCreateProject,
    lockedProject,
    placeholder = 'Add a task…',
}: TaskComposerProps) {
    const [title, setTitle] = useState('')
    const [focused, setFocused] = useState(false)
    const [project, setProject] = useState<string | null>(lockedProject ?? null)
    const [dueDate, setDueDate] = useState<string | null>(null)
    const [high, setHigh] = useState(false)
    const [saving, setSaving] = useState(false)

    const expanded = focused || title.trim().length > 0

    async function submit(e: FormEvent) {
        e.preventDefault()
        const trimmed = title.trim()
        if (!trimmed || saving) return

        setSaving(true)
        try {
            await onCreate({
                title: trimmed,
                project: lockedProject ?? project,
                dueDate,
                priority: high ? 'high' : 'normal',
            })
            // Only the title clears: the next task is usually more of the same.
            setTitle('')
        } finally {
            setSaving(false)
        }
    }

    const dueItems: MenuEntry[] = [
        { label: 'Today', icon: 'fa-solid fa-star', onClick: () => setDueDate(today) },
        { label: 'Tomorrow', icon: 'fa-solid fa-forward', onClick: () => setDueDate(addDays(today, 1)) },
        { label: 'Next week', icon: 'fa-solid fa-arrow-right', onClick: () => setDueDate(nextMonday(today)) },
        'divider',
        { label: 'No date', icon: 'fa-solid fa-xmark', onClick: () => setDueDate(null) },
    ]

    const projectOptions: RefOption[] = projects
        .filter((p) => p.status === 'active' || p._id === project)
        .map((p) => ({ id: p._id, label: p.name, dotClass: PROJECT_COLORS[p.color].dot }))

    return (
        <form
            onSubmit={submit}
            className="rounded-3xl bg-white p-2 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow focus-within:ring-brand-200"
        >
            <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                    <i className="fa-solid fa-plus text-sm" aria-hidden="true" />
                </span>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={placeholder}
                    aria-label="New task"
                    className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
                />
                {title.trim() && (
                    <button
                        type="submit"
                        disabled={saving}
                        className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
                    >
                        {saving ? 'Adding…' : 'Add'}
                    </button>
                )}
            </div>

            {expanded && (
                <div
                    // Keeps the options from stealing the blur that would collapse
                    // this row before the click lands — except on the inputs
                    // inside them, which need the focus the default would give.
                    onMouseDown={(e) => {
                        if (!(e.target as HTMLElement).closest('input, textarea')) {
                            e.preventDefault()
                        }
                    }}
                    className="flex flex-wrap items-center gap-2 border-t border-neutral-100 px-1 pb-1 pt-2.5"
                >
                    {!lockedProject && (
                        <RefPicker
                            size="sm"
                            options={projectOptions}
                            value={project}
                            onChange={setProject}
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
                    )}

                    <DropdownMenu
                        items={dueItems}
                        trigger={
                            <span
                                role="button"
                                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                    dueDate
                                        ? 'border-neutral-200 bg-white text-neutral-800'
                                        : 'border-dashed border-neutral-300 bg-white text-neutral-400 hover:border-neutral-400 hover:text-neutral-900'
                                }`}
                            >
                                <i className="fa-regular fa-calendar text-[11px] opacity-60" aria-hidden="true" />
                                {dueDate ? formatDateShort(dueDate) : 'No date'}
                            </span>
                        }
                    />

                    <button
                        type="button"
                        onClick={() => setHigh((h) => !h)}
                        aria-pressed={high}
                        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            high
                                ? 'border-red-200 bg-red-50 text-red-600'
                                : 'border-dashed border-neutral-300 bg-white text-neutral-400 hover:border-neutral-400 hover:text-neutral-900'
                        }`}
                    >
                        <i className="fa-solid fa-flag text-[11px]" aria-hidden="true" />
                        {high ? 'High priority' : 'Priority'}
                    </button>

                    <span className="ml-auto hidden pr-1 text-[11px] text-neutral-300 sm:block">
                        Enter to add
                    </span>
                </div>
            )}
        </form>
    )
}
