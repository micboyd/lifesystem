/**
 * Resting burn, for the Timeline's projection only (lib/timeline.ts) — it has
 * to guess each future day's burn at a weight you're not at yet.
 *
 * A day that's happened never uses this: its calories out is the total from
 * a watch, typed into the meal planner.
 */

/** Mifflin–St Jeor, kcal/day. */
export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: 'male' | 'female'): number {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
}

/** Whole years old on `date` ("YYYY-MM-DD"). */
export function ageOn(birthDate: string, date: string): number {
    const [by, bm, bd] = birthDate.split('-').map(Number)
    const [y, m, d] = date.split('-').map(Number)
    return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}
