import { bodyFatSeries, daysBetween, trendSeries } from './weightTrend'
import type { BodyProfile, WeightLog } from '../types'

/**
 * Basal metabolic rate, worked out rather than typed in.
 *
 * Mifflin–St Jeor is the figure used everywhere: height, age and sex from the
 * body profile, and the *trend* weight on the day — not that morning's
 * reading, which swings a kilo on water and would make the BMR swing with it.
 * Each day uses its own trend weight and age, so past days keep the balance
 * they had and the figure drifts down by itself as weight comes off.
 *
 * Katch–McArdle (from lean mass) is offered only as a second opinion, when a
 * recent body-fat reading exists: impedance body fat is too noisy to lead.
 */

/** Mifflin–St Jeor, kcal/day. */
export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: 'male' | 'female'): number {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
}

/** Katch–McArdle, kcal/day: 370 + 21.6 × lean mass. */
export function katchMcArdle(weightKg: number, bodyFatPct: number): number {
    return 370 + 21.6 * weightKg * (1 - bodyFatPct / 100)
}

/** Whole years old on `date` ("YYYY-MM-DD"). */
export function ageOn(birthDate: string, date: string): number {
    const [by, bm, bd] = birthDate.split('-').map(Number)
    const [y, m, d] = date.split('-').map(Number)
    return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** What's still needed before BMR can be worked out — empty when nothing is. */
export function missingForBmr(profile: BodyProfile | undefined, logs: WeightLog[]): string[] {
    const missing: string[] = []
    if (!profile?.heightCm) missing.push('height')
    if (!profile?.birthDate) missing.push('date of birth')
    if (!profile?.sex) missing.push('sex')
    if (logs.length === 0) missing.push('a weigh-in')
    return missing
}

/** The value of the last point on or before `date`, else the first one after it. */
function valueOn<T extends { date: string }>(points: T[], date: string): T | null {
    if (points.length === 0) return null
    let found: T | null = null
    for (const p of points) {
        if (p.date > date) break
        found = p
    }
    return found ?? points[0]
}

/**
 * A lookup of the BMR on any date, or null for every date until the profile
 * and at least one weigh-in are in.
 */
export function makeBmrLookup(profile: BodyProfile | undefined, logs: WeightLog[]): (date: string) => number | null {
    const { heightCm, birthDate, sex } = profile ?? {}
    const trend = trendSeries(logs)
    if (!heightCm || !birthDate || !sex || trend.length === 0) return () => null
    const cache = new Map<string, number>()
    return (date) => {
        let bmr = cache.get(date)
        if (bmr === undefined) {
            const weight = valueOn(trend, date)!.trend
            bmr = Math.round(mifflinStJeor(weight, heightCm, ageOn(birthDate, date), sex))
            cache.set(date, bmr)
        }
        return bmr
    }
}

/** Body fat older than this isn't a fair second opinion. */
export const BODY_FAT_FRESH_DAYS = 28

export interface BmrReadout {
    bmr: number
    weightKg: number
    age: number
    /** Katch–McArdle, when there's a body-fat reading in the last four weeks. */
    fromLeanMass: { bmr: number; bodyFatPct: number } | null
}

/** Today's figure and what it came from — for the profile. */
export function bmrReadout(profile: BodyProfile | undefined, logs: WeightLog[], date: string): BmrReadout | null {
    const { heightCm, birthDate, sex } = profile ?? {}
    const trend = trendSeries(logs)
    if (!heightCm || !birthDate || !sex || trend.length === 0) return null
    const weightKg = valueOn(trend, date)!.trend
    const age = ageOn(birthDate, date)
    const fat = bodyFatSeries(logs).filter((p) => p.date <= date)
    const lastFat = fat[fat.length - 1]
    const fresh = lastFat && daysBetween(lastFat.date, date) <= BODY_FAT_FRESH_DAYS
    return {
        bmr: Math.round(mifflinStJeor(weightKg, heightCm, age, sex)),
        weightKg,
        age,
        fromLeanMass: fresh
            ? { bmr: Math.round(katchMcArdle(weightKg, lastFat.trend)), bodyFatPct: lastFat.trend }
            : null,
    }
}
