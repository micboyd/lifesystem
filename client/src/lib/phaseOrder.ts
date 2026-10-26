/** Whole days from a to b, both YYYY-MM-DD. */
function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * How far a phase sits from today: 0 while it is running, otherwise the days
 * until it starts or since it ended.
 */
export function phaseDistance(phase: { startDate: string; endDate: string }, today: string): number {
    if (today < phase.startDate) return daysBetween(today, phase.startDate)
    if (today > phase.endDate) return daysBetween(phase.endDate, today)
    return 0
}

/**
 * Phases closest to today first — the current one, then whichever starts or
 * ended soonest. Ties go to the later start, so an upcoming phase beats one
 * that finished the same number of days ago.
 */
export function byClosest<T extends { startDate: string; endDate: string }>(
    phases: T[],
    today: string
): T[] {
    return [...phases].sort(
        (a, b) =>
            phaseDistance(a, today) - phaseDistance(b, today) ||
            b.startDate.localeCompare(a.startDate)
    )
}
