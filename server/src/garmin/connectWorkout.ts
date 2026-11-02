/**
 * WatchSteps → the workout JSON Garmin Connect's workout service takes. Only the
 * Connect provider uses this: it is the one place plan units (metres, seconds,
 * seconds per km) become Garmin's (metres, seconds, metres per second).
 *
 * Everything is a running workout, walks included — the library has no working
 * walking type, and a run workout runs walk steps fine.
 */
import type { WatchStep, WatchStepType } from '../lib/watchSteps'
import type { PaceTarget } from '../lib/paceRules'

/**
 * Longest workout name sent. Garmin doesn't document the limit and the library
 * doesn't enforce one; 80 is a conservative guess, well over any session name.
 */
export const GARMIN_NAME_MAX = 80
/** Longest step note sent — what the watch shows under each step. */
const DESCRIPTION_MAX = 100

const RUNNING = { sportTypeId: 1, sportTypeKey: 'running', displayOrder: 1 }

const STEP_TYPE: Record<WatchStepType, { stepTypeId: number; stepTypeKey: string; displayOrder: number }> = {
    warmup: { stepTypeId: 1, stepTypeKey: 'warmup', displayOrder: 1 },
    cooldown: { stepTypeId: 2, stepTypeKey: 'cooldown', displayOrder: 2 },
    run: { stepTypeId: 3, stepTypeKey: 'interval', displayOrder: 3 },
    walk: { stepTypeId: 4, stepTypeKey: 'recovery', displayOrder: 4 },
    recovery: { stepTypeId: 4, stepTypeKey: 'recovery', displayOrder: 4 },
    other: { stepTypeId: 7, stepTypeKey: 'other', displayOrder: 7 },
}
const REPEAT_TYPE = { stepTypeId: 6, stepTypeKey: 'repeat', displayOrder: 6 }

const LAP_BUTTON = { conditionTypeId: 1, conditionTypeKey: 'lap.button', displayOrder: 1, displayable: true }
const TIME = { conditionTypeId: 2, conditionTypeKey: 'time', displayOrder: 2, displayable: true }
const DISTANCE = { conditionTypeId: 3, conditionTypeKey: 'distance', displayOrder: 3, displayable: true }
const ITERATIONS = { conditionTypeId: 7, conditionTypeKey: 'iterations', displayOrder: 7, displayable: false }

const NO_TARGET = { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target', displayOrder: 1 }
const PACE_ZONE = { workoutTargetTypeId: 6, workoutTargetTypeKey: 'pace.zone', displayOrder: 6 }

/** Seconds per km → metres per second, Garmin's unit for pace. */
export function secPerKmToMps(secPerKm: number): number {
    return 1000 / secPerKm
}

/**
 * A pace band as Garmin's pace target. Garmin stores speed, so the slower pace
 * is the lower value: targetValueOne = slowest, targetValueTwo = fastest.
 */
export function paceTargetValues(t: PaceTarget): { targetValueOne: number; targetValueTwo: number } {
    return {
        targetValueOne: round(secPerKmToMps(t.slowestSecPerKm)),
        targetValueTwo: round(secPerKmToMps(t.fastestSecPerKm)),
    }
}

function round(n: number): number {
    return Math.round(n * 1e6) / 1e6
}

/** Trim a session name to what Garmin keeps. */
export function workoutName(name: string): string {
    const t = name.trim() || 'Session'
    return t.length <= GARMIN_NAME_MAX ? t : `${t.slice(0, GARMIN_NAME_MAX - 1).trimEnd()}…`
}

type GarminStep = Record<string, unknown>

/**
 * Garmin numbers every step depth-first across the whole workout, and tags a
 * repeat and its children with a shared childStepId.
 */
function toSteps(steps: WatchStep[], counter: { order: number; child: number }, childStepId?: number): GarminStep[] {
    return steps.map((s) => {
        const stepOrder = ++counter.order
        if (s.type === 'repeat') {
            const child = ++counter.child
            return {
                type: 'RepeatGroupDTO',
                stepOrder,
                stepType: REPEAT_TYPE,
                childStepId: child,
                numberOfIterations: s.times,
                endCondition: ITERATIONS,
                endConditionValue: s.times,
                smartRepeat: false,
                workoutSteps: toSteps(s.steps, counter, child),
            }
        }
        const end =
            s.end.kind === 'distance'
                ? { endCondition: DISTANCE, endConditionValue: s.end.metres }
                : s.end.kind === 'time'
                  ? { endCondition: TIME, endConditionValue: s.end.seconds }
                  : { endCondition: LAP_BUTTON }
        // Only run steps carry a pace alert, whatever the source says.
        const pace = s.type === 'run' && s.paceTarget
        return {
            type: 'ExecutableStepDTO',
            stepOrder,
            ...(childStepId !== undefined ? { childStepId } : {}),
            stepType: STEP_TYPE[s.type],
            ...end,
            targetType: pace ? PACE_ZONE : NO_TARGET,
            ...(pace ? paceTargetValues(s.paceTarget!) : {}),
            description: s.label.slice(0, DESCRIPTION_MAX),
        }
    })
}

/** The full workout body for Garmin's create (POST) and update (PUT) calls. */
export function toGarminWorkout(name: string, steps: WatchStep[], estimatedSeconds: number) {
    return {
        workoutName: workoutName(name),
        sportType: RUNNING,
        estimatedDurationInSecs: Math.max(0, Math.round(estimatedSeconds)),
        workoutSegments: [
            {
                segmentOrder: 1,
                sportType: RUNNING,
                workoutSteps: toSteps(steps, { order: 0, child: 0 }),
            },
        ],
    }
}
