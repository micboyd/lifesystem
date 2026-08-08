import { Types } from 'mongoose'
import FitnessPlanEntry, {
    FitnessPlanKind,
    FITNESS_PLAN_PARTS,
    FitnessPlanPart,
} from '../models/FitnessPlanEntry'

/** A "YYYY-MM-DD" day key. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** One placement of an imported item onto the weekly planner. */
export interface PlanPlacement {
    date: string
    part: FitnessPlanPart
}

/** Keep the slot if recognised, else fall back to the morning slot. */
function toPart(v: unknown): FitnessPlanPart {
    return FITNESS_PLAN_PARTS.includes(v as FitnessPlanPart)
        ? (v as FitnessPlanPart)
        : FITNESS_PLAN_PARTS[0]
}

/**
 * Normalise the optional `plan` field of an imported library item into a list of
 * placements. Accepts a bare date string ("YYYY-MM-DD", morning by default), a
 * `{ date, part }` object, or an array of either — so one item can be scheduled
 * onto several days. Absent/empty → no placements. Any malformed entry pushes a
 * per-item reason onto `errors` (the import is all-or-nothing) and is skipped.
 */
export function parsePlacements(raw: unknown, itemLabel: string, errors: string[]): PlanPlacement[] {
    if (raw == null) return []
    const entries = Array.isArray(raw) ? raw : [raw]
    const out: PlanPlacement[] = []
    for (const entry of entries) {
        let date = ''
        let part: FitnessPlanPart = FITNESS_PLAN_PARTS[0]
        if (typeof entry === 'string') {
            date = entry.trim()
        } else if (entry && typeof entry === 'object') {
            const obj = entry as Record<string, unknown>
            date = typeof obj.date === 'string' ? obj.date.trim() : ''
            part = toPart(obj.part)
        } else {
            errors.push(`${itemLabel}: each "plan" entry must be a date string or a { date, part } object`)
            continue
        }
        if (!DATE_RE.test(date)) {
            errors.push(`${itemLabel}: "plan" date must be "YYYY-MM-DD"`)
            continue
        }
        out.push({ date, part })
    }
    return out
}

/** Set the ref field matching `kind`; the others stay null. */
function refFields(kind: FitnessPlanKind, itemId: string) {
    return {
        workout: kind === 'workout' ? itemId : null,
        session: kind === 'conditioning' ? itemId : null,
        recovery: kind === 'recovery' ? itemId : null,
        mobility: kind === 'mobility' ? itemId : null,
    }
}

/** An imported library item paired with one target slot on the planner. */
export interface PlanEntrySpec {
    itemId: string
    date: string
    part: FitnessPlanPart
}

/**
 * Create weekly-planner entries for freshly imported library items. Each entry
 * appends to the end of its day+slot; when several land in the same slot in one
 * import they keep their incoming order. Returns how many entries were created.
 */
export async function placeOnPlan(
    userId: Types.ObjectId | string,
    kind: FitnessPlanKind,
    specs: PlanEntrySpec[]
): Promise<number> {
    if (specs.length === 0) return 0

    // Cache the next free `order` per day+slot, seeded from what's already there,
    // so multiple placements into one slot don't collide.
    const nextOrder = new Map<string, number>()
    const docs: Record<string, unknown>[] = []
    for (const { itemId, date, part } of specs) {
        const key = `${date}|${part}`
        let order = nextOrder.get(key)
        if (order === undefined) {
            const last = await FitnessPlanEntry.findOne({ user: userId, date, part }).sort({ order: -1 })
            order = last ? last.order + 1 : 0
        }
        docs.push({ user: userId, date, part, kind, ...refFields(kind, itemId), order })
        nextOrder.set(key, order + 1)
    }

    await FitnessPlanEntry.insertMany(docs)
    return docs.length
}
