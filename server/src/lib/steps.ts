/**
 * A sub-list on one item of a workout or session — the drills inside a warm-up
 * block ("Leg swings ×10", "Hip circles ×10"), the cues inside a cool-down. Each
 * is ticked off on its own in the gym; the item's own Completed press still
 * marks the item.
 */

/** Longest list kept — a sub-list, not a second session. */
const MAX_STEPS = 30

/**
 * The item's `steps` as `{ steps }`, or `{}` when it has none. Accepts an array
 * of strings, or one string with a line per step (how a textarea sends it).
 */
export function readSteps(o: Record<string, unknown>): { steps?: string[] } {
    const raw = o.steps
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : []
    const steps = list
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
        .slice(0, MAX_STEPS)
    return steps.length ? { steps } : {}
}
