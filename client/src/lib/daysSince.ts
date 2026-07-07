/** Day-counting maths shared by the Days Since page and dashboard widget. */

import type { DaysSinceItem } from '../types'

/** Whole days elapsed from `startDate` up to `todayKey` (both "YYYY-MM-DD"). */
export function daysBetween(startDate: string, todayKey: string): number {
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ty, tm, td] = todayKey.split('-').map(Number)
    const start = Date.UTC(sy, sm - 1, sd)
    const today = Date.UTC(ty, tm - 1, td)
    return Math.round((today - start) / 86_400_000)
}

/** Longest run ever, accounting for a current run that's already the record. */
export function bestDays(item: DaysSinceItem, todayKey: string): number {
    return Math.max(item.bestStreakDays, daysBetween(item.startDate, todayKey))
}

/** Fixed early milestones; after a year, every anniversary is a milestone. */
const FIXED_MILESTONES = [1, 7, 30, 100, 365]

export function milestoneLabel(days: number): string {
    if (days >= 365 && days % 365 === 0) {
        const years = days / 365
        return `${years} year${years > 1 ? 's' : ''}`
    }
    return `${days} days`
}

/** Smallest milestone strictly greater than `days`. */
export function nextMilestone(days: number): number {
    for (const m of FIXED_MILESTONES) if (days < m) return m
    return (Math.floor(days / 365) + 1) * 365
}

/** Largest milestone reached so far (0 before the first). */
export function prevMilestone(days: number): number {
    if (days >= 365) return Math.floor(days / 365) * 365
    let prev = 0
    for (const m of FIXED_MILESTONES) if (m <= days) prev = m
    return prev
}

/** True on the exact day a milestone is hit — worth celebrating. */
export function isMilestoneDay(days: number): boolean {
    return days > 0 && (FIXED_MILESTONES.includes(days) || days % 365 === 0)
}

/** 0–1 progress from the previous milestone toward the next. */
export function milestoneProgress(days: number): number {
    const prev = prevMilestone(days)
    const next = nextMilestone(days)
    if (next === prev) return 1
    return Math.max(0, Math.min(1, (days - prev) / (next - prev)))
}

/** "12 Jun 2026" from a "YYYY-MM-DD" key. */
export function formatStartDate(startDate: string): string {
    const [y, m, d] = startDate.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}
