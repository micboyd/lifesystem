/**
 * The planned time slot of one item in a strength workout or conditioning
 * session: minutes from the start of the session, e.g. squats 15 → 30. During
 * the session each item is tapped off against its slot, so you can see where
 * you are against the plan.
 */
import { flattenPhases, type Phased } from './phases'

export interface TimeWindow {
    startMin?: number
    endMin?: number
}

/**
 * When an item was tapped completed: an ISO string or ms timestamp → Date, or
 * undefined when it isn't a real time.
 */
export function toTimestamp(raw: unknown): Date | undefined {
    if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
    const d = new Date(raw)
    return Number.isFinite(d.getTime()) ? d : undefined
}

/** A minute mark ≥ 0, to the nearest second (so 1.5 = 1:30), else undefined. */
export function toMinutes(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || n < 0) return undefined
    return Math.round(n * 60) / 60
}

/**
 * The item's slot as `{ startMin, endMin }`, or `{}` when it doesn't have a
 * usable one — both marks are needed, and the end has to come after the start.
 */
export function readWindow(o: Record<string, unknown>): TimeWindow {
    const startMin = toMinutes(o.startMin)
    const endMin = toMinutes(o.endMin)
    if (startMin === undefined || endMin === undefined || endMin <= startMin) return {}
    return { startMin, endMin }
}

/**
 * Imports must time every item, in order. Returns one error per item in `raw`
 * (the phased, pre-normalisation lists) without a valid `startMin`/`endMin`,
 * and one per item that ends before the item ahead of it — pace is judged from
 * the gap between one item's end and the next, so the slots have to run in
 * session order (warm-up, main, cool-down).
 */
export function missingWindows(raw: Phased<unknown>, label: string): string[] {
    const errors: string[] = []
    let prev: { name: string; endMin: number } | null = null
    for (const { item } of flattenPhases(raw)) {
        // A bare name ("Barbell row") can't carry a slot, so it counts as untimed.
        const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        const name =
            typeof item === 'string' ? item.trim() : typeof o.name === 'string' ? o.name.trim() : ''
        if (!name) continue // unnamed lines are dropped anyway
        const w = readWindow(o)
        if (w.startMin === undefined || w.endMin === undefined) {
            errors.push(
                `${label}: "${name}" needs "startMin" and "endMin" (minutes into the session, end after start)`
            )
            continue
        }
        if (prev && w.endMin < prev.endMin) {
            errors.push(
                `${label}: "${name}" ends at ${w.endMin} min, before "${prev.name}" ahead of it (${prev.endMin} min) — slots must run in session order`
            )
        }
        prev = { name, endMin: w.endMin }
    }
    return errors
}
