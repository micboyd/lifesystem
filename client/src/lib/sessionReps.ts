/**
 * Reading a conditioning section's reps for display. The import side — and what
 * each field means — is server/src/lib/sessionReps.ts.
 *
 * Every section shows as reps, however it was written: `reps` when the plan had
 * them, otherwise reps built from the older `rounds` + `roundDetails` or a
 * `steps` list, so old sessions read the same as new ones.
 */
import type { RepEffort, SessionPart, SessionRep } from '../types'

/** The section's reps — written, or carried over from the older fields. */
export function partReps(part: SessionPart): SessionRep[] {
    if (part.reps?.length) return part.reps
    if (part.rounds && part.rounds >= 1) {
        const label = part.roundLabel?.trim() || 'Rep'
        const name = label.charAt(0).toUpperCase() + label.slice(1)
        return Array.from({ length: part.rounds }, (_, i) => ({
            do: part.roundDetails?.[i]?.trim() || `${name} ${i + 1}`,
        }))
    }
    if (part.steps?.length) return part.steps.map((s) => ({ do: s }))
    return []
}

/** A run of identical reps: the rep, how many, and where the run starts. */
export interface RepGroup {
    rep: SessionRep
    times: number
    /** Index of the first rep in the run. */
    from: number
}

/** Consecutive identical reps folded together — six intervals read as one row. */
export function repGroups(reps: SessionRep[]): RepGroup[] {
    const groups: RepGroup[] = []
    reps.forEach((rep, i) => {
        const last = groups[groups.length - 1]
        if (last && sameRep(last.rep, rep)) last.times++
        else groups.push({ rep, times: 1, from: i })
    })
    return groups
}

function sameRep(a: SessionRep, b: SessionRep): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

/** 45 → "45 s", 90 → "90 s", 120 → "2 min", 150 → "2:30". */
export function formatSeconds(sec: number): string {
    if (sec % 60 === 0) return `${sec / 60} min`
    if (sec < 120) return `${sec} s`
    const m = Math.floor(sec / 60)
    return `${m}:${String(sec % 60).padStart(2, '0')}`
}

/** 400 → "400 m", 1500 → "1.5 km". */
export function formatMetres(m: number): string {
    return m >= 1000 ? `${Math.round(m / 10) / 100} km` : `${m} m`
}

export type FactKind = 'count' | 'distance' | 'time' | 'speed' | 'pace' | 'incline' | 'effort'

/** One number worth seeing at a glance, e.g. { kind: 'speed', text: '7.0 km/h' }. */
export interface Fact {
    kind: FactKind
    text: string
}

/** The numbers of one effort, in reading order: how many, how far, how long, how hard. */
export function effortFacts(e: RepEffort): Fact[] {
    const facts: Fact[] = []
    if (e.count) facts.push({ kind: 'count', text: `×${e.count}` })
    if (e.metres) facts.push({ kind: 'distance', text: formatMetres(e.metres) })
    if (e.seconds) facts.push({ kind: 'time', text: formatSeconds(e.seconds) })
    if (e.speed) facts.push({ kind: 'speed', text: e.speed })
    if (e.pace) facts.push({ kind: 'pace', text: e.pace })
    if (e.incline) facts.push({ kind: 'incline', text: /incline/i.test(e.incline) ? e.incline : `${e.incline} incline` })
    if (e.effort) facts.push({ kind: 'effort', text: e.effort })
    return facts
}

/** Total distance of a section's reps, rests included, in metres (0 when none). */
export function repsDistance(reps: SessionRep[]): number {
    return reps.reduce((n, r) => n + (r.metres ?? 0) + (r.rest?.metres ?? 0), 0)
}

function effortOut(e: RepEffort): Record<string, unknown> {
    return {
        do: e.do,
        ...(e.seconds ? { time: formatSeconds(e.seconds) } : {}),
        ...(e.metres ? { distance: formatMetres(e.metres) } : {}),
        ...(e.count ? { count: e.count } : {}),
        ...(e.speed ? { speed: e.speed } : {}),
        ...(e.pace ? { pace: e.pace } : {}),
        ...(e.incline ? { incline: e.incline } : {}),
        ...(e.effort ? { effort: e.effort } : {}),
        ...(e.note ? { note: e.note } : {}),
    }
}

/** Reps in the import format, identical runs folded into `times`, so an export pastes back in. */
export function repsForExport(reps: SessionRep[]): Record<string, unknown>[] {
    return repGroups(reps).map((g) => ({
        ...(g.times > 1 ? { times: g.times } : {}),
        ...effortOut(g.rep),
        ...(g.rep.rest ? { rest: effortOut(g.rep.rest) } : {}),
    }))
}

/** Seconds a rep takes, rest included — undefined unless every piece is timed. */
export function repSeconds(rep: SessionRep): number | undefined {
    if (!rep.seconds) return undefined
    if (!rep.rest) return rep.seconds
    return rep.rest.seconds ? rep.seconds + rep.rest.seconds : undefined
}
