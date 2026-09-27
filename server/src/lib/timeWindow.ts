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
 * Imports must time every item. Returns one error per item in `raw` (the
 * phased, pre-normalisation lists) without a valid `startMin`/`endMin`.
 */
export function missingWindows(raw: Phased<unknown>, label: string): string[] {
    const errors: string[] = []
    for (const { item } of flattenPhases(raw)) {
        // A bare name ("Barbell row") can't carry a slot, so it counts as untimed.
        const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        const name =
            typeof item === 'string' ? item.trim() : typeof o.name === 'string' ? o.name.trim() : ''
        if (!name) continue // unnamed lines are dropped anyway
        if (readWindow(o).startMin === undefined) {
            errors.push(
                `${label}: "${name}" needs "startMin" and "endMin" (minutes into the session, end after start)`
            )
        }
    }
    return errors
}
