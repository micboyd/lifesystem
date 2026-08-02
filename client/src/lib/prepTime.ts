/**
 * Estimating batch prep time.
 *
 * A meal stores `prepTime` — the estimated minutes to prep a *single* serving.
 * Cooking more servings doesn't cost that time again per serving: some of it is
 * one-time setup (tools out, preheating, boiling water, cleanup) that happens
 * once no matter the batch size. We model it as
 *
 *     estimate(n) = prepTime × ( k + (1 − k) × n )
 *
 * where `k` (0–1) is the one-time-overhead fraction. At n = 1 this returns
 * `prepTime` exactly; `k = 0` is naive linear scaling; `k = 1` means the batch
 * size makes no difference. Each meal may override `k` via `prepOverhead`;
 * otherwise the global default below applies.
 */

/** Default overhead fraction when a meal doesn't set its own. */
export const DEFAULT_PREP_OVERHEAD = 0.35

/** Resolve a meal's overhead fraction, clamped to 0–1, falling back to the default. */
export function overheadFor(prepOverhead?: number): number {
    if (typeof prepOverhead !== 'number' || !Number.isFinite(prepOverhead)) return DEFAULT_PREP_OVERHEAD
    return Math.min(1, Math.max(0, prepOverhead))
}

/**
 * Estimated minutes to prep `servings` servings, or `null` if the meal has no
 * prep time recorded. `servings` is clamped to at least 1.
 */
export function estimatePrepTime(
    prepTime: number | undefined,
    servings: number,
    prepOverhead?: number
): number | null {
    if (typeof prepTime !== 'number' || !Number.isFinite(prepTime) || prepTime <= 0) return null
    const n = Math.max(1, servings)
    const k = overheadFor(prepOverhead)
    return prepTime * (k + (1 - k) * n)
}

/**
 * Format a minute count as a compact, human duration: "25 min", "1 hr",
 * "1 hr 30 min". Rounds to the nearest minute.
 */
export function formatDuration(minutes: number): string {
    const total = Math.round(minutes)
    if (total < 60) return `${total} min`
    const hrs = Math.floor(total / 60)
    const mins = total % 60
    return mins ? `${hrs} hr ${mins} min` : `${hrs} hr`
}
