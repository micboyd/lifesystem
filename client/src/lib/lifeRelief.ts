import { addMonthsToKey, daysInMonth, monthKeyOf, parseDateKey } from './calendar'
import {
    RESERVES,
    computeMonthLoads,
    overloadedReserves,
    type LoadInput,
    type MonthLoad,
    type Reserve,
} from './lifeLoad'
import type { LaneSource } from './lifeTimeline'

/**
 * What to move, to make a month survivable.
 *
 * `overload.ts:findFreeSlot` does exactly this a day at a time: a slot is
 * carrying two hard sessions, so it looks for the nearest slot that could take
 * one of them. This is the same idea a month wide, and it's what turns the
 * pressure check from a diagnosis into a plan — knowing October is over on
 * recovery is only half the sentence, and the other half is "and moving the exam
 * to November fixes it".
 *
 * Every suggestion is worked out by actually moving the record and rescoring the
 * whole window, not by subtracting the commitment's cost from the month. Those
 * two answers differ, and the second one is wrong: shifting a commitment doesn't
 * delete it, it lands somewhere else, and where it lands is exactly what you need
 * to know before you agree to the move.
 *
 * Nothing here writes anything. A suggestion is a sentence, and the record stays
 * owned by the module that owns it.
 */

/** How many months either side of a commitment are worth trying. */
export const MAX_SHIFT = 3

export interface Relief {
    /** The month being relieved. */
    month: string
    /** The reserve that was over, and that this move addresses. */
    reserve: Reserve
    source: LaneSource
    recordId: string
    /** `LoadContributor.id` of the commitment to move. */
    contributorId: string
    label: string
    /** Months to move it by, signed — negative is earlier. */
    shift: number
    /** The relieved month's ratio for `reserve`, before and after the move. */
    before: number
    after: number
    /** True when the move tips no other month over that wasn't already. */
    clean: boolean
}

// ─── Moving a record ────────────────────────────────────────────────────────

/**
 * A YYYY-MM-DD shifted by whole months, clamping the day to the month it lands
 * in — so a phase ending on the 31st moved into a 30-day month ends on the 30th
 * rather than rolling into the next one.
 */
function shiftDate(date: string, months: number): string {
    const { day } = parseDateKey(date)
    const month = addMonthsToKey(monthKeyOf(date), months)
    const [year, m] = month.split('-').map(Number)
    const clamped = Math.min(day, daysInMonth(year, m - 1))
    return `${month}-${String(clamped).padStart(2, '0')}`
}

/**
 * The same input with one record moved. Everything else is left alone, so the
 * rescore reflects the move and nothing but the move.
 *
 * A training plan's materialised schedule moves with it: leaving the dated
 * sessions where they were would score the plan in one month and its sessions in
 * another.
 */
function withRecordShifted(
    input: LoadInput,
    source: LaneSource,
    recordId: string,
    months: number
): LoadInput {
    switch (source) {
        case 'trainingPlan':
            return {
                ...input,
                trainingPlans: (input.trainingPlans ?? []).map((tp) =>
                    tp._id === recordId
                        ? {
                              ...tp,
                              planStart: shiftDate(tp.planStart, months),
                              planEnd: shiftDate(tp.planEnd, months),
                              schedule: tp.schedule?.map((e) => ({
                                  ...e,
                                  date: shiftDate(e.date, months),
                              })),
                          }
                        : tp
                ),
            }
        case 'nutritionPhase':
            return {
                ...input,
                nutritionPhases: (input.nutritionPhases ?? []).map((p) =>
                    p._id === recordId
                        ? {
                              ...p,
                              startDate: shiftDate(p.startDate, months),
                              endDate: shiftDate(p.endDate, months),
                          }
                        : p
                ),
            }
        case 'savingsTarget':
            return {
                ...input,
                savingsTargets: (input.savingsTargets ?? []).map((t) =>
                    t._id === recordId
                        ? {
                              ...t,
                              startMonth: addMonthsToKey(t.startMonth, months),
                              targetMonth: addMonthsToKey(t.targetMonth, months),
                          }
                        : t
                ),
            }
        case 'course':
            return {
                ...input,
                courses: (input.courses ?? []).map((c) =>
                    c._id === recordId && c.targetDate
                        ? { ...c, targetDate: shiftDate(c.targetDate, months) }
                        : c
                ),
            }
        case 'monthNote':
            return {
                ...input,
                monthNotes: (input.monthNotes ?? []).map((n) =>
                    n._id === recordId
                        ? {
                              ...n,
                              startMonth: addMonthsToKey(n.startMonth, months),
                              endMonth: addMonthsToKey(n.endMonth, months),
                          }
                        : n
                ),
            }
        case 'goal':
            return {
                ...input,
                goals: (input.goals ?? []).map((g) =>
                    g._id === recordId && g.targetDate
                        ? { ...g, targetDate: shiftDate(g.targetDate, months) }
                        : g
                ),
            }
    }
}

// ─── Scoring a move ─────────────────────────────────────────────────────────

/** Every month/reserve pair that is over capacity, as `"2026-10:body"` keys. */
function overloadKeys(loads: MonthLoad[]): Set<string> {
    const keys = new Set<string>()
    for (const load of loads)
        for (const reserve of RESERVES)
            if (load.reserves[reserve].level === 'overloaded') keys.add(`${load.month}:${reserve}`)
    return keys
}

function ratioAt(loads: MonthLoad[], month: string, reserve: Reserve): number {
    return loads.find((l) => l.month === month)?.reserves[reserve].ratio ?? 0
}

/**
 * Moves that would take `month` back under its capacity, best first.
 *
 * "Best" is: the move that clears the overload outright beats one that only eases
 * it; a smaller move beats a bigger one; and a move that tips nothing else over
 * beats one that does. Moves that make the month *worse* are dropped — a
 * suggestion has to be an improvement to be worth the sentence.
 *
 * `baseline` is the unmodified window, passed in so the caller doesn't pay to
 * recompute it once per candidate.
 */
export function findRelief(
    input: LoadInput,
    baseline: MonthLoad[],
    month: string,
    limit = 4
): Relief[] {
    const load = baseline.find((l) => l.month === month)
    if (!load) return []

    const alreadyOver = overloadKeys(baseline)
    const found: Relief[] = []

    for (const reserve of overloadedReserves(load)) {
        const before = reserve.ratio ?? 0

        for (const { contributor } of reserve.contributions) {
            for (const shift of shiftsToTry()) {
                const moved = computeMonthLoads(
                    withRecordShifted(input, contributor.source, contributor.recordId, shift)
                )
                const after = ratioAt(moved, month, reserve.reserve)
                // A move has to actually help, by more than a rounding error.
                if (after >= before - 0.01) continue

                const nowOver = overloadKeys(moved)
                const clean = [...nowOver].every((key) => alreadyOver.has(key))

                found.push({
                    month,
                    reserve: reserve.reserve,
                    source: contributor.source,
                    recordId: contributor.recordId,
                    contributorId: contributor.id,
                    label: contributor.label,
                    shift,
                    before,
                    after,
                    clean,
                })
            }
        }
    }

    // One suggestion per commitment: the nearest move that does the job, not
    // every move that would.
    const bestPerContributor = new Map<string, Relief>()
    for (const relief of found) {
        const existing = bestPerContributor.get(relief.contributorId)
        if (!existing || rank(relief) < rank(existing)) bestPerContributor.set(relief.contributorId, relief)
    }

    return [...bestPerContributor.values()].sort((a, b) => rank(a) - rank(b)).slice(0, limit)
}

/** ±1, ±2, ±3 — nearest first, later preferred over earlier at equal distance. */
function shiftsToTry(): number[] {
    const out: number[] = []
    for (let n = 1; n <= MAX_SHIFT; n++) out.push(n, -n)
    return out
}

/**
 * Lower is better. Clearing the overload dominates everything else, then not
 * breaking another month, then distance, then how much it helped.
 */
function rank(relief: Relief): number {
    const clears = relief.after < 1 ? 0 : 1000
    const dirty = relief.clean ? 0 : 100
    return clears + dirty + Math.abs(relief.shift) * 10 + (relief.after - relief.before)
}

/** "Move Exam back a month" — the suggestion as a sentence. */
export function describeRelief(relief: Relief): string {
    const n = Math.abs(relief.shift)
    const when = n === 1 ? 'a month' : `${n} months`
    return `Move ${relief.label} ${relief.shift > 0 ? 'back' : 'forward'} ${when}`
}
