/**
 * A conditioning session as a structured workout for a watch: a list of steps,
 * each ending on a distance, a time or a lap-button press, some with a pace
 * alert, and repeats around identical rounds.
 *
 * Nothing here knows about Garmin — `garmin/connectWorkout.ts` turns these steps
 * into Garmin's format. Every session produces a workout: a session can carry
 * its own `watchSteps`; otherwise steps are derived from its parts, and any part
 * that can't be read exactly falls back to its planned slot (or the lap button)
 * and is listed as approximated, so a send is never blocked on structure.
 */
import { createHash } from 'crypto'
import type { ISessionPart } from '../models/ConditioningSession'
import { SESSION_PHASES, type Phased, type SessionPhase } from './phases'
import { PACE_RULES, paceBand, parsePace, type PaceTarget } from './paceRules'

export const WATCH_STEP_TYPES = ['warmup', 'run', 'walk', 'recovery', 'cooldown', 'other'] as const
export type WatchStepType = (typeof WATCH_STEP_TYPES)[number]

export type WatchStepEnd =
    | { kind: 'distance'; metres: number }
    | { kind: 'time'; seconds: number }
    | { kind: 'lapButton' }

export type WatchStep =
    | { type: WatchStepType; label: string; end: WatchStepEnd; paceTarget?: PaceTarget }
    | { type: 'repeat'; times: number; steps: WatchStep[] }

/** What the preview and the send both work from. */
export interface WatchWorkout {
    steps: WatchStep[]
    /** Labels of the steps that are a best guess rather than read from the plan. */
    approximated: string[]
    /** Where the steps came from. */
    source: 'watchSteps' | 'derived'
}

// ─── Reading imported watchSteps ────────────────────────────────────────────────

/** Deepest a repeat may nest — Garmin's editor allows repeats inside repeats, barely. */
const MAX_DEPTH = 2
const MAX_STEPS = 100

function positive(raw: unknown): number | undefined {
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined
}

function readEnd(raw: unknown, at: string, errors: string[]): WatchStepEnd | undefined {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    if (o?.kind === 'lapButton') return { kind: 'lapButton' }
    if (o?.kind === 'distance' && positive(o.metres)) return { kind: 'distance', metres: o.metres as number }
    if (o?.kind === 'time' && positive(o.seconds))
        return { kind: 'time', seconds: Math.round(o.seconds as number) }
    errors.push(`${at}: "end" must be { kind: "distance", metres }, { kind: "time", seconds } or { kind: "lapButton" }`)
    return undefined
}

function readPaceTarget(raw: unknown, at: string, errors: string[]): PaceTarget | undefined {
    if (raw === undefined || raw === null) return undefined
    const o = typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const fastest = positive(o.fastestSecPerKm)
    const slowest = positive(o.slowestSecPerKm)
    if (fastest === undefined || slowest === undefined || fastest > slowest) {
        errors.push(`${at}: "paceTarget" needs fastestSecPerKm ≤ slowestSecPerKm, both above 0`)
        return undefined
    }
    return { fastestSecPerKm: fastest, slowestSecPerKm: slowest }
}

function readStepList(raw: unknown[], at: string, depth: number, errors: string[]): WatchStep[] {
    const out: WatchStep[] = []
    raw.forEach((item, i) => {
        const here = `${at}[${i}]`
        const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
        if (!o) {
            errors.push(`${here}: must be an object`)
            return
        }
        if (o.type === 'repeat') {
            const times = positive(o.times)
            if (!times || !Number.isInteger(times)) errors.push(`${here}: "times" must be a whole number above 0`)
            if (depth >= MAX_DEPTH) errors.push(`${here}: repeats can nest at most ${MAX_DEPTH} deep`)
            if (!Array.isArray(o.steps) || o.steps.length === 0) {
                errors.push(`${here}: a repeat needs a non-empty "steps" list`)
                return
            }
            const steps = readStepList(o.steps, `${here}.steps`, depth + 1, errors)
            if (times && Number.isInteger(times)) out.push({ type: 'repeat', times, steps })
            return
        }
        if (!WATCH_STEP_TYPES.includes(o.type as WatchStepType)) {
            errors.push(`${here}: "type" must be one of ${[...WATCH_STEP_TYPES, 'repeat'].join(', ')}`)
            return
        }
        const label = typeof o.label === 'string' ? o.label.trim() : ''
        if (!label) errors.push(`${here}: "label" is required`)
        const end = readEnd(o.end, here, errors)
        const paceTarget = readPaceTarget(o.paceTarget, here, errors)
        if (label && end)
            out.push({ type: o.type as WatchStepType, label, end, ...(paceTarget ? { paceTarget } : {}) })
    })
    return out
}

/**
 * A session's imported `watchSteps`: `{ watchSteps }` when present and valid,
 * `{}` when absent, plus any errors. Absent is fine — every session can derive
 * its steps — but a list that is written and wrong fails the import, rather
 * than sending the watch something other than what was written.
 */
export function readWatchSteps(
    o: Record<string, unknown>,
    label: string
): { value: { watchSteps?: WatchStep[] }; errors: string[] } {
    if (o.watchSteps === undefined || o.watchSteps === null) return { value: {}, errors: [] }
    const errors: string[] = []
    if (!Array.isArray(o.watchSteps)) {
        return { value: {}, errors: [`${label}: "watchSteps" must be a list`] }
    }
    const steps = readStepList(o.watchSteps, `${label} watchSteps`, 0, errors)
    if (countSteps(steps) > MAX_STEPS) errors.push(`${label}: "watchSteps" has more than ${MAX_STEPS} steps`)
    if (!errors.length && steps.length === 0) errors.push(`${label}: "watchSteps" is empty`)
    return { value: errors.length ? {} : { watchSteps: steps }, errors }
}

function countSteps(steps: WatchStep[]): number {
    return steps.reduce((n, s) => n + (s.type === 'repeat' ? 1 + countSteps(s.steps) : 1), 0)
}

// ─── Deriving steps from a session's parts ──────────────────────────────────────

const PHASE_TYPE: Record<SessionPhase, WatchStepType | null> = {
    warmUp: 'warmup',
    main: null,
    coolDown: 'cooldown',
}

/** "400 m" / "1.5 km" → metres. */
function metres(n: string, unit: string): number {
    return Math.round(Number(n) * (unit.toLowerCase() === 'km' ? 1000 : 1))
}

/** 400 → "400 m", 5000 → "5 km". */
export function formatDistance(m: number): string {
    return m >= 1000 && m % 100 === 0 ? `${m / 1000} km` : `${m} m`
}

const DIST = String.raw`(\d+(?:\.\d+)?)\s*(km|m)\b`
const PACE = String.raw`(\d{1,2}:[0-5]\d)\s*\/\s*km`

/** "5 x 400 m run at 8:30/km, then 150 m walk." */
const RUN_WALK = new RegExp(
    String.raw`^(\d+)\s*[x×]\s*${DIST}\s+run(?:\s+at\s+${PACE})?\s*,?\s*then\s+${DIST}\s+walk\.?$`,
    'i'
)
/** "5 km continuous at 8:00/km. Tap each km." */
const CONTINUOUS = new RegExp(
    String.raw`^${DIST}\s+continuous(?:\s+at\s+${PACE})?\.?(\s*tap each km\.?)?$`,
    'i'
)
/** One walk segment: "Walk 250 m easy", "200 m brisk", "400 m easy walk". */
const WALK_SEGMENT = new RegExp(String.raw`^(?:walk\s+)?${DIST}(?:\s+(easy|brisk|steady))?(?:\s+walk)?$`, 'i')

/** The step type for a run, a walk or a block in the given phase. */
function typeFor(phase: SessionPhase, inMain: WatchStepType): WatchStepType {
    return PHASE_TYPE[phase] ?? inMain
}

/** The known outdoor formats, read from a part's `detail`. Undefined when it isn't one. */
function parseDetail(detail: string, phase: SessionPhase): WatchStep[] | undefined {
    const text = detail.trim()

    const rw = RUN_WALK.exec(text)
    if (rw) {
        const [, times, runN, runU, pace, walkN, walkU] = rw
        const stated = pace ? parsePace(pace) : undefined
        const run = metres(runN, runU)
        const walk = metres(walkN, walkU)
        return [
            {
                type: 'repeat',
                times: Number(times),
                steps: [
                    {
                        type: 'run',
                        label: `Run ${formatDistance(run)}`,
                        end: { kind: 'distance', metres: run },
                        ...(stated
                            ? { paceTarget: paceBand(stated, PACE_RULES.runWalk.bandSecPerKm) }
                            : {}),
                    },
                    { type: 'walk', label: `Walk ${formatDistance(walk)}`, end: { kind: 'distance', metres: walk } },
                ],
            },
        ]
    }

    const cont = CONTINUOUS.exec(text)
    if (cont) {
        const [, n, unit, pace, eachKm] = cont
        const total = metres(n, unit)
        const stated = pace ? parsePace(pace) : undefined
        const paceTarget = stated ? paceBand(stated, PACE_RULES.continuous.bandSecPerKm) : undefined
        const step = (m: number, label: string): WatchStep => ({
            type: 'run',
            label,
            end: { kind: 'distance', metres: m },
            ...(paceTarget ? { paceTarget } : {}),
        })
        // "Tap each km" — an alert at every km, as a repeat of 1 km steps.
        if (eachKm && total % 1000 === 0 && total > 1000)
            return [{ type: 'repeat', times: total / 1000, steps: [step(1000, 'Run 1 km')] }]
        return [step(total, `Run ${formatDistance(total)}`)]
    }

    // A walk written as segments: "Walk 250 m easy, then 200 m brisk."
    if (/walk/i.test(text)) {
        const segments = text.replace(/\.$/, '').split(/\s*,?\s*then\s+/i)
        const steps: WatchStep[] = []
        for (const seg of segments) {
            const m = WALK_SEGMENT.exec(seg.trim())
            if (!m) return undefined
            const [, n, unit, effort] = m
            const d = metres(n, unit)
            steps.push({
                type: typeFor(phase, 'walk'),
                label: `Walk ${formatDistance(d)}${effort ? ` ${effort.toLowerCase()}` : ''}`,
                end: { kind: 'distance', metres: d },
            })
        }
        return steps
    }
    return undefined
}

/** Bronco shuttles are timed, so the watch waits for the lap button. */
function isBronco(part: ISessionPart): boolean {
    return /bronco/i.test(part.name) || /bronco/i.test(part.detail ?? '')
}

/** Exercises rather than running — a lap-button step, so the watch waits. */
const NON_RUNNING = /\b(raises?|squats?|lunges?|planks?|press|curls?|bridges?|push-?ups?|stretch(es|ing)?|drills?|mobility|foam roll)\b/i

function isNonRunning(part: ISessionPart): boolean {
    if (/\b(jog|run|sprint|walk|stride)/i.test(part.name)) return false
    return NON_RUNNING.test(part.name) || (!!part.steps?.length && !part.rounds)
}

/** Seconds in the part's planned slot, or undefined when it has none. */
function slotSeconds(part: ISessionPart): number | undefined {
    if (part.startMin === undefined || part.endMin === undefined) return undefined
    const s = Math.round((part.endMin - part.startMin) * 60)
    return s > 0 ? s : undefined
}

function capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

/** One part's steps, and whether they are a best guess. */
function partSteps(part: ISessionPart, phase: SessionPhase): { steps: WatchStep[]; approximate: boolean } {
    const label = part.name
    const parsed = part.detail ? parseDetail(part.detail, phase) : undefined
    if (parsed) return { steps: parsed, approximate: false }

    if (isBronco(part))
        return { steps: [{ type: typeFor(phase, 'run'), label, end: { kind: 'lapButton' } }], approximate: false }

    if (part.rounds) {
        const secs = part.roundSeconds ?? []
        const roundLabel = capitalise(part.roundLabel ?? 'round')
        const type = typeFor(phase, 'run')
        const timed = secs.length === part.rounds
        if (timed && secs.every((s) => s === secs[0])) {
            return {
                steps: [
                    {
                        type: 'repeat',
                        times: part.rounds,
                        steps: [{ type, label: `${label} - ${roundLabel.toLowerCase()}`, end: { kind: 'time', seconds: secs[0] } }],
                    },
                ],
                approximate: false,
            }
        }
        // Rounds of different lengths can't share a repeat: one timed step each.
        if (timed) {
            return {
                steps: secs.map((s, i) => ({
                    type: typeFor(phase, 'other'),
                    label: `${label} - ${roundLabel.toLowerCase()} ${i + 1}`,
                    end: { kind: 'time' as const, seconds: s },
                })),
                approximate: false,
            }
        }
    }

    if (isNonRunning(part))
        return { steps: [{ type: typeFor(phase, 'other'), label, end: { kind: 'lapButton' } }], approximate: false }

    // Nothing to read: the planned slot as a timed step, or the lap button.
    const seconds = slotSeconds(part)
    return {
        steps: [
            {
                type: typeFor(phase, 'other'),
                label,
                end: seconds ? { kind: 'time', seconds } : { kind: 'lapButton' },
            },
        ],
        approximate: true,
    }
}

/** The steps for a session — its own `watchSteps`, or derived from its parts. */
export function buildWatchWorkout(
    session: Partial<Phased<ISessionPart>> & { watchSteps?: WatchStep[] | null }
): WatchWorkout {
    if (session.watchSteps?.length) {
        return { steps: session.watchSteps, approximated: [], source: 'watchSteps' }
    }
    const steps: WatchStep[] = []
    const approximated: string[] = []
    for (const phase of SESSION_PHASES) {
        for (const part of session[phase] ?? []) {
            const out = partSteps(part, phase)
            steps.push(...out.steps)
            if (out.approximate) approximated.push(part.name)
        }
    }
    // A session with no parts at all still sends: one open step to stop by hand.
    if (steps.length === 0) {
        steps.push({ type: 'other', label: 'Session', end: { kind: 'lapButton' } })
        approximated.push('Session')
    }
    return { steps, approximated, source: 'derived' }
}

/**
 * A short fingerprint of what would be sent — the name and the steps. A planner
 * entry whose stored hash differs has changed since it went to the watch.
 */
export function watchStepsHash(name: string, steps: WatchStep[]): string {
    return createHash('sha256').update(JSON.stringify({ name, steps })).digest('hex').slice(0, 16)
}
