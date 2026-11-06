import type { ConditioningSession, SessionPart } from '../types'

/**
 * How far a conditioning session covers, for sizing its route. Warm-up, walk
 * recoveries and cool-down all count — the route is the whole outing, not just
 * the running.
 *
 * Read in order: the session's `watchSteps` (the watch workout, when every step
 * ends on a distance), then the distances written in each part's `detail`.
 * Field and team sessions are run on a pitch, not a road, so they're never
 * guessed at: they come back with no distance and the route asks for one.
 */

export type StepKind = 'run' | 'walk'

export interface RouteStep {
    kind: StepKind
    distanceM: number
    /** Seconds per km — planned for runs, worked out from the part's slot for walks. */
    paceSecPerKm: number
    label: string
}

export interface SessionDistance {
    /** Whole-session metres, or null when it can't be read reliably. */
    totalM: number | null
    steps: RouteStep[]
    source: 'watchSteps' | 'detail' | 'none'
}

/** A brisk walk, used when a part's slot doesn't give a walking pace. */
export const DEFAULT_WALK_PACE = 11 * 60
/** Used for a run written without a pace. */
export const DEFAULT_RUN_PACE = 7.5 * 60

const NUM = String.raw`(\d+(?:\.\d+)?)`
const UNIT = String.raw`(km|m)\b`
const PACE = String.raw`(\d{1,2}):(\d{2})\s*(?:\/|per)\s*km`

const toM = (n: string, unit: string) => Math.round(Number(n) * (unit.toLowerCase() === 'km' ? 1000 : 1))
const toPace = (min: string, sec: string) => Number(min) * 60 + Number(sec)

// Names and wording of sessions that aren't a run along a route: pitch drills
// measured in shuttles and walk-backs, and team sessions with no set distance.
const NOT_A_ROUTE_NAME = /\b(field|club|league|match|training)\b/i
const NOT_A_ROUTE_TEXT = /walk back|shuttle|out-and-back|sprint|build-up|stride|bronco|accelerat/i

/** The run and walk steps written in one part's detail, in order. */
export function partSteps(part: SessionPart): RouteStep[] {
    const text = part.detail ?? ''
    // "5 x 400 m run at 8:30/km, then 150 m walk."
    const interval = new RegExp(
        String.raw`(\d+)\s*x\s*${NUM}\s*${UNIT}\s*(?:run|jog)(?:[^.]*?at\s+${PACE})?[^.]*?(?:then|\+|,)\s*${NUM}\s*${UNIT}\s*walk`,
        'i'
    ).exec(text)
    if (interval) {
        const [, reps, runN, runU, pm, ps, walkN, walkU] = interval
        const pace = pm ? toPace(pm, ps) : DEFAULT_RUN_PACE
        const out: RouteStep[] = []
        for (let i = 1; i <= Number(reps); i++) {
            out.push({ kind: 'run', distanceM: toM(runN, runU), paceSecPerKm: pace, label: `Run ${i}` })
            out.push({ kind: 'walk', distanceM: toM(walkN, walkU), paceSecPerKm: DEFAULT_WALK_PACE, label: `Walk ${i}` })
        }
        return out
    }
    // "5 km continuous at 8:30/km."
    const run = new RegExp(String.raw`${NUM}\s*${UNIT}\s*(?:continuous|run|jog|easy run|steady)(?:[^.]*?at\s+${PACE})?`, 'i').exec(
        text
    )
    if (run) {
        const [, n, u, pm, ps] = run
        return [{ kind: 'run', distanceM: toM(n, u), paceSecPerKm: pm ? toPace(pm, ps) : DEFAULT_RUN_PACE, label: part.name }]
    }
    // "Walk 250 m easy, then 200 m brisk." / "400 m easy walk."
    if (/walk/i.test(text) || /walk/i.test(part.name)) {
        const all = [...text.matchAll(new RegExp(String.raw`${NUM}\s*${UNIT}`, 'gi'))]
        return all.map((m) => ({ kind: 'walk' as const, distanceM: toM(m[1], m[2]), paceSecPerKm: DEFAULT_WALK_PACE, label: part.name }))
    }
    return []
}

/**
 * Walking pace from the part's planned slot: the slot's time less the running
 * time, over the walking distance. Kept only when it's a believable walk.
 */
function withSlotWalkPace(part: SessionPart, steps: RouteStep[]): RouteStep[] {
    if (part.startMin === undefined || part.endMin === undefined) return steps
    const runSec = steps.filter((s) => s.kind === 'run').reduce((t, s) => t + (s.distanceM / 1000) * s.paceSecPerKm, 0)
    const walkKm = steps.filter((s) => s.kind === 'walk').reduce((t, s) => t + s.distanceM / 1000, 0)
    if (walkKm === 0) return steps
    const pace = ((part.endMin - part.startMin) * 60 - runSec) / walkKm
    if (pace < 8 * 60 || pace > 20 * 60) return steps
    return steps.map((s) => (s.kind === 'walk' ? { ...s, paceSecPerKm: Math.round(pace) } : s))
}

// ─── watchSteps ─────────────────────────────────────────────────────────────────

type WatchEnd = { kind: 'distance'; metres: number } | { kind: 'time'; seconds: number } | { kind: 'lapButton' }
type WatchStep =
    | { type: string; label?: string; end: WatchEnd; paceTarget?: { fastestSecPerKm: number; slowestSecPerKm: number } }
    | { type: 'repeat'; times: number; steps: WatchStep[] }

/** The watch steps flattened to route steps, or null if any step isn't a distance. */
export function watchRouteSteps(raw: unknown): RouteStep[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null
    const out: RouteStep[] = []
    const walk = (steps: WatchStep[]): boolean => {
        for (const s of steps) {
            if (s.type === 'repeat' && 'times' in s) {
                for (let i = 0; i < s.times; i++) if (!walk(s.steps)) return false
                continue
            }
            if (!('end' in s) || s.end?.kind !== 'distance') return false
            const isRun = s.type === 'run'
            const pace = s.paceTarget
                ? Math.round((s.paceTarget.fastestSecPerKm + s.paceTarget.slowestSecPerKm) / 2)
                : isRun
                  ? DEFAULT_RUN_PACE
                  : DEFAULT_WALK_PACE
            out.push({ kind: isRun ? 'run' : 'walk', distanceM: s.end.metres, paceSecPerKm: pace, label: s.label ?? s.type })
        }
        return true
    }
    return walk(raw as WatchStep[]) ? out : null
}

// ─── The whole session ──────────────────────────────────────────────────────────

const sum = (steps: RouteStep[]) => steps.reduce((t, s) => t + s.distanceM, 0)

export function sessionDistance(session: Pick<ConditioningSession, 'name' | 'warmUp' | 'main' | 'coolDown'> & { watchSteps?: unknown }): SessionDistance {
    const none: SessionDistance = { totalM: null, steps: [], source: 'none' }
    if (NOT_A_ROUTE_NAME.test(session.name)) return none

    const fromWatch = watchRouteSteps(session.watchSteps)
    if (fromWatch && fromWatch.length) return { totalM: sum(fromWatch), steps: fromWatch, source: 'watchSteps' }

    const parts = [...(session.warmUp ?? []), ...(session.main ?? []), ...(session.coolDown ?? [])]
    if (parts.some((p) => NOT_A_ROUTE_TEXT.test(p.detail ?? ''))) return none
    const mainSteps = (session.main ?? []).flatMap(partSteps)
    if (mainSteps.length === 0) return none

    const steps = parts.flatMap((p) => withSlotWalkPace(p, partSteps(p)))
    return { totalM: sum(steps), steps, source: 'detail' }
}

/** Planned seconds for the steps. */
export function plannedSeconds(steps: RouteStep[]): number {
    return Math.round(steps.reduce((t, s) => t + (s.distanceM / 1000) * s.paceSecPerKm, 0))
}

/**
 * Where each change between running and walking starts, in metres from the
 * start — consecutive steps of the same kind are one stretch.
 */
export function stepStarts(steps: RouteStep[]): { atM: number; kind: StepKind; label: string }[] {
    const out: { atM: number; kind: StepKind; label: string }[] = []
    let at = 0
    for (const s of steps) {
        if (out.length === 0 || out[out.length - 1].kind !== s.kind) out.push({ atM: at, kind: s.kind, label: s.label })
        at += s.distanceM
    }
    return out
}

/**
 * Where each run/walk change falls on a generated route: the planned steps
 * stretched to the route's actual length.
 */
export function routeStepMarkers(steps: RouteStep[], routeM: number): { atM: number; kind: StepKind; label: string }[] {
    const total = steps.reduce((t, s) => t + s.distanceM, 0)
    const scale = total > 0 ? routeM / total : 1
    return stepStarts(steps).map((s) => ({ ...s, atM: s.atM * scale }))
}
