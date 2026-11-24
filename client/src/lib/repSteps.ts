/**
 * A cardio section as a step list to follow — "Run for 3 min" at 11:30, "Walk
 * for 1:30" at 14:30 — each step with the time it starts in the session plan.
 * No live clock: the times are the plan's, read against the gym or watch clock.
 */
import type { RepEffort, SessionPart, SessionRep } from '../types'
import { effortFacts, formatMetres, partReps, repGroups, type Fact } from './sessionReps'

export interface Step {
    /** "Run for 3 min", "Walk 400 m", "Calf raises ×10". */
    phrase: string
    /** Planned start, seconds into the session — when it can be worked out. */
    at?: number
    /** The other numbers: speed, pace, incline, effort (and distance when time leads). */
    facts: Fact[]
    note?: string
    /** The recovery half of a rep. */
    rest: boolean
}

/** One rep of the section as its steps: the work, then its recovery. */
export interface RepStep {
    index: number
    steps: Step[]
}

/** 180 → "3 min", 90 → "1:30", 45 → "45 s", 3600 → "60 min". */
export function stepDuration(sec: number): string {
    if (sec < 60) return `${sec} s`
    if (sec % 60 === 0) return `${sec / 60} min`
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/** Seconds into the session as a clock mark: 690 → "11:30", 3930 → "65:30". */
export function mark(sec: number): string {
    const s = Math.max(0, Math.round(sec))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The effort as a phrase that reads aloud — its length or count, the rest as facts. */
export function phraseOf(e: RepEffort): { phrase: string; facts: Fact[] } {
    const facts = effortFacts(e)
    const without = (...k: Fact['kind'][]) => facts.filter((f) => !k.includes(f.kind))
    if (e.seconds)
        return { phrase: `${e.do} for ${stepDuration(e.seconds)}`, facts: without('time') }
    if (e.metres) return { phrase: `${e.do} ${formatMetres(e.metres)}`, facts: without('distance') }
    if (e.count) return { phrase: `${e.do} ×${e.count}`, facts: without('count') }
    return { phrase: e.do, facts }
}

/** Where the section starts, seconds into the session. */
function sectionStart(part: SessionPart): number | undefined {
    if (part.startAtSec !== undefined) return part.startAtSec
    return part.startMin !== undefined ? part.startMin * 60 : undefined
}

/**
 * The section's reps as steps with their planned start times. A step without
 * its own length stops the times after it — better none than wrong ones.
 */
export function sectionSteps(part: SessionPart): RepStep[] {
    const reps: SessionRep[] = part.reps?.length
        ? part.reps
        : part.rounds && part.rounds > 0
          ? Array.from({ length: part.rounds }, (_, i) => ({
                do:
                    part.roundDetails?.[i]?.trim() ||
                    `${part.roundLabel?.trim() || 'Round'} ${i + 1}`,
                ...(part.roundSeconds?.[i] ? { seconds: part.roundSeconds[i] } : {}),
            }))
          : [
                {
                    do: part.name,
                    ...(part.startMin !== undefined &&
                    part.endMin !== undefined &&
                    part.endMin > part.startMin
                        ? { seconds: (part.endMin - part.startMin) * 60 }
                        : {}),
                    ...(part.detail ? { note: part.detail } : {}),
                },
            ]

    let t = sectionStart(part)
    return reps.map((rep, index) => {
        const steps: Step[] = []
        for (const [e, rest] of [
            [rep, false],
            ...(rep.rest ? [[rep.rest, true] as const] : []),
        ] as [RepEffort, boolean][]) {
            const { phrase, facts } = phraseOf(e)
            steps.push({
                phrase,
                facts,
                rest,
                ...(t !== undefined ? { at: t } : {}),
                ...(e.note ? { note: e.note } : {}),
            })
            t = t !== undefined && e.seconds ? t + e.seconds : undefined
        }
        return { index, steps }
    })
}

/** An effort in a few words: "Run 4 min (7.2 km/h)". */
function shortEffort(e: RepEffort): string {
    const size = e.seconds
        ? stepDuration(e.seconds)
        : e.metres
          ? formatMetres(e.metres)
          : e.count
            ? `×${e.count}`
            : ''
    const how = e.speed || e.pace
    return [e.do, size].filter(Boolean).join(' ') + (how ? ` (${how})` : '')
}

/**
 * A section at a glance, one line per run of identical reps — "3× Run 4 min
 * (7.2 km/h) · Walk 1:30 (5.0 km/h)" — for the overview before you start.
 */
export function sectionLines(part: SessionPart): string[] {
    const reps = partReps(part)
    return repGroups(reps).map((g) => {
        const line = [g.rep, ...(g.rep.rest ? [g.rep.rest] : [])].map(shortEffort).join(' · ')
        return g.times > 1 ? `${g.times}× ${line}` : line
    })
}
