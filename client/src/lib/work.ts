/**
 * The judgement calls behind the work workspace's lists.
 *
 * Kept out of the pages and free of React so the rules that actually decide
 * what you see — what counts as overdue, when a blocked item has sat too long,
 * when a project's status line has gone stale — can be read and tested in one
 * place instead of being spelled out again in every component.
 */

import { daysBetween } from './daysSince'
import { formatDateShort, parseDateKey, WEEKDAYS_LONG } from './calendar'
import type { WorkProject, WorkProjectColor, WorkTask, WorkTaskPriority } from '../types'

/* ── Due dates ───────────────────────────────────────────────────────────── */

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday'

/** Display order of the buckets — the order the day actually happens in. */
export const DUE_BUCKETS: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'someday']

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
    overdue: 'Overdue',
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'This week',
    later: 'Later',
    someday: 'No date',
}

/**
 * Undated work lands in `someday` rather than being hidden. Most work tasks
 * never get a date, and a view that quietly drops them is how things get
 * forgotten.
 */
export function dueBucket(dueDate: string | undefined, today: string): DueBucket {
    if (!dueDate) return 'someday'
    const diff = daysBetween(today, dueDate)
    if (diff < 0) return 'overdue'
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    if (diff <= 7) return 'week'
    return 'later'
}

/** "Overdue by 3 days", "Due today", "Due Thu", "Due 12 Sep 2026". */
export function dueLabel(dueDate: string, today: string): string {
    const diff = daysBetween(today, dueDate)
    if (diff < 0) {
        const n = Math.abs(diff)
        return `Overdue by ${n} day${n === 1 ? '' : 's'}`
    }
    if (diff === 0) return 'Due today'
    if (diff === 1) return 'Due tomorrow'
    if (diff <= 6) {
        const { year, month, day } = parseDateKey(dueDate)
        return `Due ${WEEKDAYS_LONG[new Date(year, month, day).getDay()].slice(0, 3)}`
    }
    return `Due ${formatDateShort(dueDate)}`
}

/* ── Priority ────────────────────────────────────────────────────────────── */

const PRIORITY_RANK: Record<WorkTaskPriority, number> = { high: 0, normal: 1, low: 2 }

/**
 * Within a bucket, high priority floats and low sinks; everything else keeps
 * the order you dragged it into. Priority never reorders the buckets
 * themselves — a high-priority task due next month is still due next month.
 */
export function sortTasks(tasks: WorkTask[]): WorkTask[] {
    return [...tasks].sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order
    )
}

/* ── Grouping ────────────────────────────────────────────────────────────── */

export interface TaskGroup {
    key: string
    label: string
    /** Secondary line — a project's status, a bucket's count. */
    hint?: string
    tasks: WorkTask[]
}

/** Groups by due bucket, dropping empty buckets so the page has no dead rows. */
export function groupByDue(tasks: WorkTask[], today: string): TaskGroup[] {
    const byBucket = new Map<DueBucket, WorkTask[]>()
    for (const task of tasks) {
        const bucket = dueBucket(task.dueDate, today)
        const list = byBucket.get(bucket)
        if (list) list.push(task)
        else byBucket.set(bucket, [task])
    }

    return DUE_BUCKETS.filter((bucket) => byBucket.get(bucket)?.length).map((bucket) => ({
        key: bucket,
        label: DUE_BUCKET_LABELS[bucket],
        tasks: sortTasks(byBucket.get(bucket)!),
    }))
}

/**
 * Groups by project, projects in their own display order and unfiled work
 * last — it's the pile you're meant to file, so it belongs at the bottom
 * rather than jumping the queue alphabetically.
 */
export function groupByProject(tasks: WorkTask[], projects: WorkProject[]): TaskGroup[] {
    const groups: TaskGroup[] = []

    for (const project of projects) {
        const owned = tasks.filter((t) => t.project === project._id)
        if (owned.length) {
            groups.push({ key: project._id, label: project.name, tasks: sortTasks(owned) })
        }
    }

    const known = new Set(projects.map((p) => p._id))
    const unfiled = tasks.filter((t) => !t.project || !known.has(t.project))
    if (unfiled.length) {
        groups.push({ key: 'unfiled', label: 'No project', tasks: sortTasks(unfiled) })
    }

    return groups
}

/* ── Waiting ─────────────────────────────────────────────────────────────── */

export type WaitTone = 'fresh' | 'aging' | 'stale'

/** A week is patient; a fortnight is a problem. */
export const AGING_AFTER_DAYS = 7
export const STALE_AFTER_DAYS = 14

/**
 * How long this has been blocked. Falls back to the creation date for tasks
 * that predate the server stamping `waitingSince`, so an old item still shows
 * an age rather than a confident zero.
 */
export function waitingDays(task: WorkTask, today: string): number {
    const since = task.waitingSince ?? task.createdAt.slice(0, 10)
    return Math.max(0, daysBetween(since, today))
}

export function waitTone(days: number): WaitTone {
    if (days >= STALE_AFTER_DAYS) return 'stale'
    if (days >= AGING_AFTER_DAYS) return 'aging'
    return 'fresh'
}

/** Days since the last chase, or null if it's never been chased. */
export function daysSinceNudge(task: WorkTask, today: string): number | null {
    if (!task.nudgedAt) return null
    return Math.max(0, daysBetween(task.nudgedAt, today))
}

/**
 * Whether chasing is the obvious next move: it's been sitting a while, and you
 * haven't already chased it recently. The second half is what stops the page
 * nagging about something you followed up on this morning.
 */
export function needsChase(task: WorkTask, today: string): boolean {
    if (waitingDays(task, today) < AGING_AFTER_DAYS) return false
    const since = daysSinceNudge(task, today)
    return since === null || since >= AGING_AFTER_DAYS
}

export interface WaitingGroup {
    /** Person id, or 'unassigned' for items blocked on nobody in particular. */
    key: string
    label: string
    tasks: WorkTask[]
    /** Age of the oldest item — what the group is sorted and coloured by. */
    oldestDays: number
    needsChase: number
}

/**
 * Groups blocked work by who owes it, longest-waiting person first. The
 * question this page answers is "who do I need to chase", so the sort is by
 * age rather than by name.
 */
export function groupByPerson(
    tasks: WorkTask[],
    names: Map<string, string>,
    today: string
): WaitingGroup[] {
    const byPerson = new Map<string, WorkTask[]>()
    for (const task of tasks) {
        const key = task.waitingOn ?? 'unassigned'
        const list = byPerson.get(key)
        if (list) list.push(task)
        else byPerson.set(key, [task])
    }

    return [...byPerson.entries()]
        .map(([key, list]) => ({
            key,
            label: key === 'unassigned' ? 'Not assigned' : (names.get(key) ?? 'Unknown'),
            tasks: [...list].sort((a, b) => waitingDays(b, today) - waitingDays(a, today)),
            oldestDays: Math.max(...list.map((t) => waitingDays(t, today))),
            needsChase: list.filter((t) => needsChase(t, today)).length,
        }))
        .sort((a, b) => b.oldestDays - a.oldestDays || a.label.localeCompare(b.label))
}

/* ── Projects ────────────────────────────────────────────────────────────── */

/** A status line nobody has touched in this long has stopped being a status. */
export const STALE_STATE_AFTER_DAYS = 14

/** Days since the project's state line was last rewritten, or null if never. */
export function stateAgeDays(project: WorkProject, today: string): number | null {
    if (!project.stateUpdatedAt) return null
    return Math.max(0, daysBetween(project.stateUpdatedAt.slice(0, 10), today))
}

/**
 * Stale means "this needs a fresh look" — either the state was never written,
 * or it's old enough to be untrustworthy. Only asked of live projects; a
 * finished one having an old status line is just history.
 */
export function isStateStale(project: WorkProject, today: string): boolean {
    if (project.status !== 'active') return false
    const age = stateAgeDays(project, today)
    return age === null || age >= STALE_STATE_AFTER_DAYS
}

/** "Updated today", "Updated 3 days ago", "Never updated". */
export function stateAgeLabel(project: WorkProject, today: string): string {
    const age = stateAgeDays(project, today)
    if (age === null) return 'No status yet'
    if (age === 0) return 'Updated today'
    if (age === 1) return 'Updated yesterday'
    return `Updated ${age} days ago`
}

/**
 * Full Tailwind class strings per project colour. Spelled out rather than
 * assembled — Tailwind v4 scans source text, so `bg-${color}-50` compiles to
 * nothing.
 */
export const PROJECT_COLORS: Record<WorkProjectColor, { chip: string; dot: string }> = {
    slate: { chip: 'bg-neutral-100 text-neutral-600', dot: 'bg-neutral-400' },
    blue: { chip: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
    violet: { chip: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
    emerald: { chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    amber: { chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    rose: { chip: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
    teal: { chip: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' },
}
