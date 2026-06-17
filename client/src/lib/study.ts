import type { Course, TotalValue } from '../types'
import { MONTHS, parseDateKey } from './calendar'

/** Round to 2 decimals to keep float noise out of hour sums. */
function round(n: number): number {
    return Math.round(n * 100) / 100
}

export interface MonthBankEntry {
    /** YYYY-MM */
    month: string
    /** "June 2026" */
    label: string
    hours: number
}

/** Sum study-row values by calendar month, ascending, dropping empty months. */
export function bankByMonth(values: TotalValue[]): MonthBankEntry[] {
    const byMonth = new Map<string, number>()
    for (const v of values) {
        const month = v.date.slice(0, 7)
        byMonth.set(month, (byMonth.get(month) ?? 0) + v.value)
    }
    return [...byMonth.entries()]
        .filter(([, hours]) => hours !== 0)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, hours]) => {
            const { year, month: m } = parseDateKey(`${month}-01`)
            return { month, label: `${MONTHS[m]} ${year}`, hours: round(hours) }
        })
}

export type CourseStatus = 'completed' | 'scheduled' | 'insufficient'

export interface CourseProjection {
    course: Course
    /** Total hours done so far: manual offset + logged past hours applied here. */
    completedHours: number
    /** Of `completedHours`, the portion drawn from logged calendar days. */
    loggedApplied: number
    /** requiredHours − completedHours, floored at 0. */
    remainingHours: number
    /** First future study date that feeds this course. */
    startDate: string | null
    /** Date the requirement is met; null when capacity runs out first. */
    finishDate: string | null
    /** Hours still uncovered by available capacity (0 when it finishes). */
    shortByHours: number
    status: CourseStatus
}

export interface StudyProjection {
    courses: CourseProjection[]
    /** Past study-row hours (dated before `from`) — counted as completed. */
    loggedHours: number
    /** Future capacity (study-row hours dated on/after `from`). */
    availableHours: number
    /** Total remaining hours across all courses. */
    requiredHours: number
}

/**
 * Project sequential course completion.
 *
 * Study-row hours split at `from` (today): days before it are *logged* — study
 * already done — and burn down courses in priority order; days on/after it are
 * future *capacity*, walked in date order to project finish dates. Each course's
 * manual `completedHours` is an additional per-course head-start offset.
 *
 * Courses are consumed in array order (priority): course N only begins once
 * every prior course's remaining hours are covered. A course whose requirement
 * falls beyond the available capacity is flagged `insufficient`.
 */
export function projectCourses(
    courses: Course[],
    values: TotalValue[],
    from: string
): StudyProjection {
    // Logged pool: shared past hours, allocated to courses in priority order.
    let loggedPool = round(
        values.filter((v) => v.date < from).reduce((s, v) => s + v.value, 0)
    )
    const loggedHours = loggedPool

    // Future capacity: a cumulative-hours timeline from today-forward entries.
    const entries = values
        .filter((v) => v.date >= from)
        .sort((a, b) => a.date.localeCompare(b.date))
    const timeline: { date: string; cum: number }[] = []
    let cum = 0
    for (const e of entries) {
        cum += e.value
        timeline.push({ date: e.date, cum })
    }
    const availableHours = round(cum)

    /** First timeline date whose cumulative is strictly greater than `t`. */
    const firstDateAbove = (t: number): string | null =>
        timeline.find((p) => p.cum > t)?.date ?? null
    /** First timeline date whose cumulative reaches `t`. */
    const firstDateAtLeast = (t: number): string | null =>
        timeline.find((p) => p.cum >= t)?.date ?? null

    let prefix = 0 // future hours consumed by prior courses
    const projected = courses.map<CourseProjection>((course) => {
        const offset = Math.max(course.completedHours, 0)
        // Net still needed after this course's own head-start offset.
        const netNeeded = Math.max(course.requiredHours - offset, 0)
        // Draw shared logged hours into this course, in priority order.
        const loggedApplied = Math.min(loggedPool, netNeeded)
        loggedPool = round(loggedPool - loggedApplied)
        const completedHours = round(Math.min(offset + loggedApplied, course.requiredHours))
        const remainingHours = round(Math.max(course.requiredHours - completedHours, 0))

        if (remainingHours === 0) {
            return {
                course,
                completedHours,
                loggedApplied: round(loggedApplied),
                remainingHours: 0,
                startDate: null,
                finishDate: null,
                shortByHours: 0,
                status: 'completed',
            }
        }

        const startThreshold = prefix
        const finishThreshold = prefix + remainingHours
        prefix = finishThreshold

        const startDate = startThreshold < availableHours ? firstDateAbove(startThreshold) : null
        if (finishThreshold > availableHours) {
            return {
                course,
                completedHours,
                loggedApplied: round(loggedApplied),
                remainingHours,
                startDate,
                finishDate: null,
                shortByHours: round(finishThreshold - availableHours),
                status: 'insufficient',
            }
        }
        return {
            course,
            completedHours,
            loggedApplied: round(loggedApplied),
            remainingHours,
            startDate,
            finishDate: firstDateAtLeast(finishThreshold),
            shortByHours: 0,
            status: 'scheduled',
        }
    })

    const requiredHours = round(projected.reduce((s, p) => s + p.remainingHours, 0))
    return { courses: projected, loggedHours, availableHours, requiredHours }
}
