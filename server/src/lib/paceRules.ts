/**
 * How the plan's written paces become pace alerts on the watch. Kept in one
 * place so a change of rule is one edit, not a hunt through the step parser.
 *
 * Paces are seconds per km throughout. Only run steps get a target — walks,
 * warm-ups and cool-downs never do.
 */
export const PACE_RULES = {
    /**
     * Run-walk levels ("5 x 400 m run at 8:30/km, then 150 m walk"). The written
     * pace is a ceiling to stay under, not a pace to hold, so the alert band is
     * wide: 8:30/km → 8:00–9:00/km.
     */
    runWalk: { bandSecPerKm: 30 },
    /**
     * Continuous runs ("5 km continuous at 8:00/km"). The written pace is the
     * goal, so the band is tight: 8:00/km → 7:45–8:15/km.
     */
    continuous: { bandSecPerKm: 15 },
} as const

export interface PaceTarget {
    fastestSecPerKm: number
    slowestSecPerKm: number
}

/** A stated pace widened by `band` either side. */
export function paceBand(secPerKm: number, band: number): PaceTarget {
    return { fastestSecPerKm: secPerKm - band, slowestSecPerKm: secPerKm + band }
}

/** "8:30" → 510, or undefined. */
export function parsePace(raw: string): number | undefined {
    const m = /^(\d{1,2}):([0-5]\d)$/.exec(raw.trim())
    return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

/** 510 → "8:30". */
export function formatPace(secPerKm: number): string {
    const s = Math.round(secPerKm)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
