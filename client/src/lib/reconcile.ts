import type { BudgetTopUp, StarlingMovement } from '../types'

const EPSILON = 0.005

/** Subset search is exponential in the worst case; months never have anywhere
 * near this many unrecorded movements, so the cap only guards pathology. */
const MAX_SUBSET_CANDIDATES = 18

/** Signed effect of a movement on the space balance: +in, −out. Declined and
 * reversed card auths never actually moved money, so they contribute nothing. */
export function movementEffect(m: StarlingMovement): number {
    if (m.reason === 'declined' || m.reason === 'reversed') return 0
    return m.direction === 'IN' ? m.amount : -m.amount
}

/** What a movement was matched against in the ledger. */
export type MovementMatch = 'monthly-funding' | 'top-up' | 'refill'

export interface ExplainedMovement {
    movement: StarlingMovement
    /** Signed cash effect on the space (+in / −out). */
    effect: number
    /** The ledger record this movement corresponds to, or null if unrecorded. */
    matchedTo: MovementMatch | null
}

export interface GapDiagnosis {
    /** Movements the ledger already expects — the monthly funding transfer plus
     * recorded top-ups and refills. These can't be the cause of a gap. */
    accounted: ExplainedMovement[]
    /** Recorded top-ups/refills with no matching bank transfer — the record
     * exists but the money never reached the space. */
    ghostRecords: BudgetTopUp[]
    /** Smallest set of unrecorded movements whose net effect equals the gap
     * exactly, or null when no combination matches. */
    culprits: ExplainedMovement[] | null
    /** Every unrecorded movement, for when no exact combination exists. */
    unaccounted: ExplainedMovement[]
    /** Gap left over after netting off every unrecorded movement — non-zero
     * means something outside this month (e.g. an opening balance) is involved. */
    residualAfterAll: number
}

/**
 * Explain a reconciliation gap by matching the month's bank movements against
 * what the ledger already knows about, then searching the unmatched remainder
 * for the exact combination that adds up to the gap.
 *
 * `gap` is the unexplained difference (space balance minus what the budget
 * expects, after day-off spending and refills are netted off): positive means
 * the space holds more than the plan, negative less.
 */
export function diagnoseGap(
    gap: number,
    movements: StarlingMovement[],
    monthlyAmount: number,
    topUps: BudgetTopUp[]
): GapDiagnosis {
    const entries: ExplainedMovement[] = movements
        .map((m) => ({ movement: m, effect: movementEffect(m), matchedTo: null as MovementMatch | null }))
        .filter((e) => Math.abs(e.effect) > EPSILON)

    // Credits the ledger expects to have reached the space: the monthly funding
    // transfer plus every recorded top-up and refill. Each expected credit
    // claims at most one movement of the same amount, nearest date first.
    const expected: { key: MovementMatch; amount: number; date: string; record?: BudgetTopUp }[] = []
    if (monthlyAmount > EPSILON) expected.push({ key: 'monthly-funding', amount: monthlyAmount, date: '' })
    for (const t of topUps) {
        expected.push({ key: t.kind === 'refill' ? 'refill' : 'top-up', amount: t.amount, date: t.date, record: t })
    }

    const ghostRecords: BudgetTopUp[] = []
    for (const exp of expected) {
        const candidates = entries.filter(
            (e) => e.matchedTo === null && e.effect > 0 && Math.abs(e.effect - exp.amount) <= EPSILON
        )
        if (candidates.length === 0) {
            if (exp.record) ghostRecords.push(exp.record)
            continue
        }
        const best = exp.date
            ? candidates.sort(
                  (a, b) =>
                      Math.abs(Date.parse(a.movement.date) - Date.parse(exp.date)) -
                      Math.abs(Date.parse(b.movement.date) - Date.parse(exp.date))
              )[0]
            : candidates[0]
        best.matchedTo = exp.key
    }

    const unmatched = entries.filter((e) => e.matchedTo === null)

    // Smallest subset of unmatched movements summing exactly to the gap, in
    // pennies. Map of reachable sum → smallest index-set that reaches it.
    let culprits: ExplainedMovement[] | null = null
    const target = Math.round(gap * 100)
    if (target !== 0 && unmatched.length > 0 && unmatched.length <= MAX_SUBSET_CANDIDATES) {
        const best = new Map<number, number[]>([[0, []]])
        for (let i = 0; i < unmatched.length; i++) {
            const pennies = Math.round(unmatched[i].effect * 100)
            for (const [sum, idxs] of [...best]) {
                const next = sum + pennies
                const candidate = [...idxs, i]
                const prev = best.get(next)
                if (!prev || candidate.length < prev.length) best.set(next, candidate)
            }
        }
        const hit = best.get(target)
        if (hit && hit.length > 0) culprits = hit.map((i) => unmatched[i])
    }

    const netUnmatched = unmatched.reduce((sum, e) => sum + e.effect, 0)

    return {
        accounted: entries.filter((e) => e.matchedTo !== null),
        ghostRecords,
        culprits,
        unaccounted: unmatched,
        residualAfterAll: gap - netUnmatched,
    }
}
