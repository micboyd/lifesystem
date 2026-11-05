/**
 * What the app needs from Garmin, and nothing about how it's done. The Connect
 * provider (connectProvider.ts) does it through python-garminconnect today; an
 * official Training API provider can implement the same interface later
 * without the sync logic or the UI changing.
 */
import type { WatchStep } from '../lib/watchSteps'

/** A workout as the app describes it — steps in plan units, not Garmin's. */
export interface WorkoutSpec {
    name: string
    steps: WatchStep[]
    /** Rough length, for Garmin's estimate. */
    estimatedSeconds: number
}

/** One activity from Garmin's list — just enough to match it to a plan entry. */
export interface ActivityBrief {
    activityId: string
    name: string
    /** Garmin's type key: running, treadmill_running, walking, hiking… */
    typeKey: string
    /** "YYYY-MM-DD HH:MM:SS" in the watch's local time — its first 10 characters are the day. */
    startLocal: string
    startGMT: string
    distanceM: number | null
    durationS: number | null
    movingS: number | null
    avgHr: number | null
    /** The Garmin workout it was run from, when it was started from one. */
    workoutId: string | null
}

export interface ActivitySummary extends ActivityBrief {
    elapsedS: number | null
    /** Metres per second. */
    avgSpeed: number | null
    maxSpeed: number | null
    maxHr: number | null
    elevGainM: number | null
    elevLossM: number | null
    /** Steps per minute. */
    cadence: number | null
    calories: number | null
    aerobicTE: number | null
    anaerobicTE: number | null
    teLabel: string | null
    deviceName: string | null
}

export interface ActivityLap {
    index: number
    distanceM: number | null
    durationS: number | null
    movingS: number | null
    avgSpeed: number | null
    avgHr: number | null
    maxHr: number | null
    elevGainM: number | null
    /** WARMUP, ACTIVE, INTERVAL, RECOVERY, REST, COOLDOWN… */
    intensity: string | null
    /** Which workout step the lap was, when run from a workout. */
    stepIndex: number | null
}

export interface ActivityZone {
    zone: number
    seconds: number
    lowBpm: number | null
}

/** Series sampled together: elapsed seconds, metres, bpm, m/s, metres. */
export interface ActivityChart {
    t?: (number | null)[]
    d?: (number | null)[]
    hr?: (number | null)[]
    speed?: (number | null)[]
    elev?: (number | null)[]
}

export interface ActivityDetail {
    summary: ActivitySummary
    laps: ActivityLap[]
    zones: ActivityZone[]
    /** [lng, lat] pairs; empty without GPS. */
    track: number[][]
    chart: ActivityChart
}

export interface GarminWorkoutProvider {
    createWorkout(workout: WorkoutSpec): Promise<{ workoutId: string }>
    /** Replace a workout in place, keeping its id — schedules pointing at it follow. */
    updateWorkout(workoutId: string, workout: WorkoutSpec): Promise<void>
    /** Put a workout on the Garmin calendar for a "YYYY-MM-DD". */
    scheduleWorkout(workoutId: string, date: string): Promise<{ scheduleId: string }>
    /** Take one calendar placement off. Already gone counts as done. */
    unscheduleWorkout(scheduleId: string): Promise<void>
    /** Push a workout straight to the watch. */
    sendToDevice(workoutId: string): Promise<{ deviceName?: string }>
    /** Activities that started on the days from–to ("YYYY-MM-DD", inclusive). */
    listActivities(from: string, to: string): Promise<ActivityBrief[]>
    /** One activity in full: summary, laps, HR zones, track and charts. */
    getActivity(activityId: string): Promise<ActivityDetail>
    /** Each day's total calories burned. Days Garmin has no figure for are left out. */
    dailyCalories(dates: string[]): Promise<DayCalories[]>
}

/** A day's whole total — resting plus active — as Garmin's daily summary has it. */
export interface DayCalories {
    date: string
    kcal: number
}

export const GARMIN_ERROR_CODES = [
    'not_configured',
    'worker_unavailable',
    'not_connected',
    'auth_failed',
    'session_expired',
    'unavailable',
    'rate_limited',
    'not_found',
    'no_device',
    'bad_request',
    'error',
] as const
export type GarminErrorCode = (typeof GARMIN_ERROR_CODES)[number]

/** What the person sees for each failure — never anything from Garmin itself. */
export const GARMIN_ERROR_MESSAGES: Record<GarminErrorCode, string> = {
    not_configured: 'Garmin isn’t set up on the server yet: GARMIN_TOKEN_KEY is missing or isn’t a 32-byte key.',
    worker_unavailable: 'The server couldn’t start its Garmin helper (Python). Check the server logs for “[garmin]”.',
    not_connected: 'Connect your Garmin account first.',
    auth_failed: 'Garmin didn’t accept those details.',
    session_expired: 'Your Garmin session has expired. Reconnect Garmin to carry on.',
    unavailable: 'Garmin Connect isn’t responding right now.',
    rate_limited: 'Garmin is limiting requests. Try again in a few minutes.',
    not_found: 'Garmin couldn’t find that.',
    no_device: 'No Garmin device was found on your account.',
    bad_request: 'Something went wrong preparing the request to Garmin.',
    error: 'Something went wrong talking to Garmin.',
}

/**
 * HTTP status each failure goes back to the browser with. Never 401: the client
 * reads a 401 as its own login having expired and signs out of AdminLife.
 */
export const GARMIN_ERROR_STATUS: Record<GarminErrorCode, number> = {
    not_configured: 503,
    worker_unavailable: 503,
    not_connected: 409,
    auth_failed: 422,
    session_expired: 409,
    unavailable: 502,
    rate_limited: 429,
    not_found: 404,
    no_device: 404,
    bad_request: 500,
    error: 502,
}

/**
 * A Garmin failure. The message is always the fixed one for its code, so an
 * error can be logged or sent to the browser without leaking anything.
 */
export class GarminError extends Error {
    readonly code: GarminErrorCode
    constructor(code: GarminErrorCode) {
        super(GARMIN_ERROR_MESSAGES[code])
        this.code = code
        this.name = 'GarminError'
    }
}

export function isGarminError(err: unknown, code?: GarminErrorCode): err is GarminError {
    return err instanceof GarminError && (code === undefined || err.code === code)
}
