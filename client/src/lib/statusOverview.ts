import type { Goal, DaysSinceItem } from '../types'
import type { DisciplineSummary } from './budgetDiscipline'
import type { HabitStreak } from './habits'
import type { Pacing } from './pacing'
import { daysBetween as daysSinceDaysBetween } from './daysSince'

export type TrafficLightStatus = 'green' | 'yellow' | 'red' | 'neutral'

export interface DomainStatus {
    key: string
    label: string
    icon: string
    href: string
    status: TrafficLightStatus
    detail: string
}

export function budgetDomainStatus(summary: DisciplineSummary): DomainStatus {
    const { score, eligibleDays } = summary
    const status: TrafficLightStatus =
        eligibleDays === 0 ? 'neutral' : score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red'
    return {
        key: 'budget',
        label: 'Budget',
        icon: 'fa-solid fa-wallet',
        href: '/finances/budgets',
        status,
        detail: eligibleDays === 0 ? 'No budget tracked' : `${score}% on budget`,
    }
}

export function habitsDomainStatus({ doneToday, total, streak }: HabitStreak): DomainStatus {
    const status: TrafficLightStatus =
        total === 0 ? 'neutral' : doneToday === total ? 'green' : doneToday > 0 || streak > 0 ? 'yellow' : 'red'
    return {
        key: 'habits',
        label: 'Habits',
        icon: 'fa-solid fa-fire',
        href: '/habits',
        status,
        detail: total === 0 ? 'No active habits' : `${doneToday}/${total} today`,
    }
}

function daysUntil(date: string, today: string): number {
    const [y, m, d] = date.split('-').map(Number)
    const [ty, tm, td] = today.split('-').map(Number)
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000)
}

export function goalsDomainStatus(goals: Goal[], today: string): DomainStatus {
    const active = goals.filter((g) => g.status === 'active')
    if (active.length === 0) {
        return {
            key: 'goals',
            label: 'Goals',
            icon: 'fa-solid fa-bullseye',
            href: '/goals',
            status: 'neutral',
            detail: 'No active goals',
        }
    }

    const overdue = active.filter((g) => g.targetDate && daysUntil(g.targetDate, today) < 0)
    const dueSoon = active.filter(
        (g) => g.targetDate && daysUntil(g.targetDate, today) >= 0 && daysUntil(g.targetDate, today) <= 7
    )

    const status: TrafficLightStatus = overdue.length > 0 ? 'red' : dueSoon.length > 0 ? 'yellow' : 'green'
    const detail =
        overdue.length > 0
            ? `${overdue.length} overdue`
            : dueSoon.length > 0
              ? `${dueSoon.length} due soon`
              : `${active.length} on track`

    return { key: 'goals', label: 'Goals', icon: 'fa-solid fa-bullseye', href: '/goals', status, detail }
}

export function daysSinceDomainStatus(items: DaysSinceItem[], today: string): DomainStatus {
    if (items.length === 0) {
        return {
            key: 'days-since',
            label: 'Days since',
            icon: 'fa-solid fa-hourglass-half',
            href: '/days-since',
            status: 'neutral',
            detail: 'No counters yet',
        }
    }

    let mostRecentReset: number | null = null
    for (const item of items) {
        const last = item.history[item.history.length - 1]
        if (!last) continue
        const age = daysSinceDaysBetween(last.endDate, today)
        if (mostRecentReset === null || age < mostRecentReset) mostRecentReset = age
    }

    const status: TrafficLightStatus =
        mostRecentReset === null ? 'green' : mostRecentReset <= 3 ? 'red' : mostRecentReset <= 14 ? 'yellow' : 'green'
    const detail =
        mostRecentReset === null
            ? 'No recent resets'
            : mostRecentReset === 0
              ? 'Reset today'
              : `Reset ${mostRecentReset}d ago`

    return {
        key: 'days-since',
        label: 'Days since',
        icon: 'fa-solid fa-hourglass-half',
        href: '/days-since',
        status,
        detail,
    }
}

export function studyDomainStatus(pacing: Pacing | null): DomainStatus {
    const base = {
        key: 'study',
        label: 'Study',
        icon: 'fa-solid fa-graduation-cap',
        href: '/study',
    }
    if (!pacing || pacing.courses.length === 0) {
        return { ...base, status: 'neutral', detail: 'No courses tracked' }
    }

    const overdue = pacing.courses.filter((c) => c.status === 'overdue').length
    const status: TrafficLightStatus = overdue > 0 ? 'red' : pacing.behindCount > 0 ? 'yellow' : 'green'
    const detail =
        overdue > 0
            ? `${overdue} overdue`
            : pacing.behindCount > 0
              ? `${pacing.behindCount} behind`
              : `${pacing.onTrackCount} on track`

    return { ...base, status, detail }
}
