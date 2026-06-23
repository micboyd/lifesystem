import type { Course, TotalValue } from '../types'
import { addDays } from './calendar'
import type { CourseProjection, StudyProjection } from './study'

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
function daysBetween(from: string, to: string): number {
    const a = Date.parse(`${from}T00:00:00Z`)
    const b = Date.parse(`${to}T00:00:00Z`)
    return Math.round((b - a) / 86_400_000)
}

/**
 * Recent logging pace in hours/day: total study-row hours logged in the
 * `windowDays` calendar days ending yesterday, divided by the window. Future
 * (planned) entries are ignored — this measures what you've actually been doing.
 */
export function recentPacePerDay(values: TotalValue[], today: string, windowDays = 28): number {
    const start = addDays(today, -windowDays)
    const sum = values
        .filter((v) => v.date >= start && v.date < today)
        .reduce((s, v) => s + (Number(v.value) || 0), 0)
    return windowDays > 0 ? sum / windowDays : 0
}

export type PacingStatus = 'done' | 'no-target' | 'on-track' | 'behind' | 'overdue'

export interface CoursePacing {
    course: Course
    targetDate: string | null
    /** This course's own remaining hours. */
    remainingHours: number
    /** Remaining hours for this course plus all earlier unfinished ones (sequential). */
    cumulativeRemaining: number
    /** Whole days from today to the target (negative when overdue). */
    daysToTarget: number
    /** Hours/day needed from today to clear the cumulative workload by the target. */
    neededPacePerDay: number
    /** Projected finish at the recent pace, or null when not logging. */
    projectedFinish: string | null
    status: PacingStatus
}

export interface Pacing {
    pacePerDay: number
    courses: CoursePacing[]
    /** Courses with a target that are behind or overdue. */
    behindCount: number
    /** Courses with a target on track. */
    onTrackCount: number
}

/**
 * On-track pacing per course. Courses finish sequentially in priority order, so a
 * course's deadline must be met by clearing every earlier unfinished course first
 * — hence the cumulative workload. "Needed pace" is that cumulative divided by the
 * days left; "projected finish" walks the cumulative forward at the recent pace.
 */
export function computePacing(
    projection: StudyProjection,
    values: TotalValue[],
    today: string,
    windowDays = 28
): Pacing {
    const pacePerDay = recentPacePerDay(values, today, windowDays)
    let cumulative = 0

    const courses = projection.courses.map<CoursePacing>((p: CourseProjection) => {
        cumulative += p.remainingHours
        const targetDate = p.course.targetDate ?? null

        if (p.remainingHours === 0) {
            return {
                course: p.course,
                targetDate,
                remainingHours: 0,
                cumulativeRemaining: cumulative,
                daysToTarget: targetDate ? daysBetween(today, targetDate) : 0,
                neededPacePerDay: 0,
                projectedFinish: null,
                status: 'done',
            }
        }

        const projectedFinish =
            pacePerDay > 0 ? addDays(today, Math.ceil(cumulative / pacePerDay)) : null

        if (!targetDate) {
            return {
                course: p.course,
                targetDate: null,
                remainingHours: p.remainingHours,
                cumulativeRemaining: cumulative,
                daysToTarget: 0,
                neededPacePerDay: 0,
                projectedFinish,
                status: 'no-target',
            }
        }

        const daysToTarget = daysBetween(today, targetDate)
        const neededPacePerDay = daysToTarget > 0 ? cumulative / daysToTarget : Infinity
        let status: PacingStatus
        if (daysToTarget < 0) status = 'overdue'
        else status = projectedFinish && projectedFinish <= targetDate ? 'on-track' : 'behind'

        return {
            course: p.course,
            targetDate,
            remainingHours: p.remainingHours,
            cumulativeRemaining: cumulative,
            daysToTarget,
            neededPacePerDay,
            projectedFinish,
            status,
        }
    })

    return {
        pacePerDay,
        courses,
        behindCount: courses.filter((c) => c.status === 'behind' || c.status === 'overdue').length,
        onTrackCount: courses.filter((c) => c.status === 'on-track').length,
    }
}
