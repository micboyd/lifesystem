import { addDays } from './calendar'
import type { Goal, HabitDef, HabitLog } from '../types'

/**
 * A goal and the habits that build toward it. `goal` is null for the habits
 * that stand on their own — routines kept for their own sake.
 */
export interface HabitSystem {
    goal: Goal | null
    habits: HabitDef[]
}

/** Dates each habit was completed on, keyed by habit id. */
export function completedDates(logs: HabitLog[]): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>()
    for (const log of logs) {
        if (!log.completed) continue
        const set = out.get(log.habit) ?? new Set<string>()
        set.add(log.date)
        out.set(log.habit, set)
    }
    return out
}

/**
 * Consecutive completed days ending at `today`. An unticked today doesn't break
 * the run — it counts back from yesterday — so a fresh morning keeps its streak.
 */
export function streakFor(done: Set<string> | undefined, today: string): number {
    if (!done) return 0
    let cursor = done.has(today) ? today : addDays(today, -1)
    let streak = 0
    while (done.has(cursor)) {
        streak++
        cursor = addDays(cursor, -1)
    }
    return streak
}

/** The last `n` dates up to and including `today`, oldest first. */
export function lastDays(today: string, n: number): string[] {
    return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
}

/**
 * Group active habits under the active goals they feed, soonest deadline first.
 * A habit linked to two goals appears in both; one linked to none lands in the
 * trailing standalone group, which is left off when it would be empty.
 */
export function buildSystems(goals: Goal[], habits: HabitDef[]): HabitSystem[] {
    const live = habits.filter((h) => h.active)
    const byId = new Map(live.map((h) => [h._id, h]))
    const active = goals
        .filter((g) => g.status === 'active')
        .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))

    const linked = new Set<string>()
    const systems: HabitSystem[] = active.map((goal) => {
        const own = goal.linkedHabits.flatMap((id) => {
            const h = byId.get(id)
            return h ? [h] : []
        })
        own.forEach((h) => linked.add(h._id))
        return { goal, habits: own }
    })

    const standalone = live.filter((h) => !linked.has(h._id))
    if (standalone.length > 0) systems.push({ goal: null, habits: standalone })
    return systems
}

/**
 * The goal fields to send when a habit joins or leaves a goal. Linking the first
 * habit switches progress to follow the habits; unlinking the last hands it
 * back to the manual slider.
 */
export function linkChange(goal: Goal, habitId: string, link: boolean): Pick<Goal, 'linkedHabits'> & Partial<Pick<Goal, 'progressMode'>> {
    const has = goal.linkedHabits.includes(habitId)
    if (link && !has) {
        const linkedHabits = [...goal.linkedHabits, habitId]
        return goal.linkedHabits.length === 0 ? { linkedHabits, progressMode: 'auto' } : { linkedHabits }
    }
    if (!link && has) {
        const linkedHabits = goal.linkedHabits.filter((id) => id !== habitId)
        return linkedHabits.length === 0 ? { linkedHabits, progressMode: 'manual' } : { linkedHabits }
    }
    return { linkedHabits: goal.linkedHabits }
}
