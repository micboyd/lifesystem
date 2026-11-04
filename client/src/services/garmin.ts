import api from './api'
import type { ApiResponse, GarminState, WatchStep } from '../types'

export interface GarminStatus {
    /** Whether the server can store tokens (GARMIN_TOKEN_KEY is set). */
    configured: boolean
    status: 'not_connected' | 'connected' | 'expired' | 'pending_mfa'
    displayName?: string
    connectedAt?: string | null
}

export interface GarminEntryState {
    state: GarminState
    lastSentAt: string | null
    scheduledDate: string | null
    /** The run linked to the entry, when there is one. */
    activity?: { distanceM: number | null; durationS: number | null } | null
}

/** A planned watch step as it stood when the run was linked. */
export type PlannedStep = Exclude<WatchStep, { type: 'repeat' }>

export interface GarminRunSummary {
    activityId: string
    name: string
    typeKey: string
    startLocal: string
    distanceM: number | null
    durationS: number | null
    movingS: number | null
    elapsedS: number | null
    avgSpeed: number | null
    maxSpeed: number | null
    avgHr: number | null
    maxHr: number | null
    elevGainM: number | null
    elevLossM: number | null
    cadence: number | null
    calories: number | null
    aerobicTE: number | null
    anaerobicTE: number | null
    teLabel: string | null
    deviceName: string | null
}

export interface GarminRunLap {
    index: number
    distanceM: number | null
    durationS: number | null
    movingS: number | null
    avgSpeed: number | null
    avgHr: number | null
    maxHr: number | null
    elevGainM: number | null
    intensity: string | null
    stepIndex: number | null
}

/** A finished run pulled from Garmin and linked to a planned entry. */
export interface GarminRun {
    activityId: string
    date: string
    entry: string | null
    log: string | null
    linkedBy: 'workout' | 'day' | 'manual' | null
    summary: GarminRunSummary
    laps: GarminRunLap[]
    zones: { zone: number; seconds: number; lowBpm: number | null }[]
    /** [lng, lat] */
    track: number[][]
    chart: {
        t?: (number | null)[]
        d?: (number | null)[]
        hr?: (number | null)[]
        speed?: (number | null)[]
        elev?: (number | null)[]
    }
    planned: PlannedStep[]
}

/** An activity on Garmin that could be picked as a day's run. */
export interface GarminRunCandidate {
    activityId: string
    name: string
    typeKey: string
    startLocal: string
    distanceM: number | null
    durationS: number | null
    avgHr: number | null
}

export interface GarminRunCheck {
    linked: { entryId: string; activityId: string; logId: string; by: 'workout' | 'day' }[]
    candidates: Record<string, GarminRunCandidate[]>
    asked: boolean
}

export interface GarminPreview extends GarminEntryState {
    name: string
    steps: WatchStep[]
    /** Labels of steps that are a best guess rather than read from the plan. */
    approximated: string[]
    source: 'watchSteps' | 'derived'
}

export interface GarminSendResult {
    state: 'sent'
    /** False when the push to the watch failed but the calendar placement worked. */
    pushed: boolean
    lastSentAt: string
    scheduledDate: string
    message: string
}

/** The failure codes the Garmin routes answer with. */
export type GarminErrorCode =
    | 'not_configured'
    | 'worker_unavailable'
    | 'not_connected'
    | 'auth_failed'
    | 'session_expired'
    | 'unavailable'
    | 'rate_limited'
    | 'not_found'
    | 'no_device'
    | 'bad_request'
    | 'error'

/** The code and message from a failed Garmin request. */
export function garminError(err: unknown): { code: GarminErrorCode; message: string } {
    const data = (err as { response?: { data?: { code?: GarminErrorCode; message?: string } } })?.response?.data
    return {
        code: data?.code ?? 'unavailable',
        message: data?.message ?? 'Couldn’t reach the server. Check your connection and try again.',
    }
}

export async function getGarminStatus(): Promise<GarminStatus> {
    return (await api.get<ApiResponse<GarminStatus>>('/garmin/status')).data.data
}

/** Sign in. The password goes to the server once and is never stored. */
export async function connectGarmin(email: string, password: string): Promise<'connected' | 'needs_mfa'> {
    const res = await api.post<ApiResponse<{ status: 'connected' | 'needs_mfa' }>>('/garmin/connect', {
        email,
        password,
    })
    return res.data.data.status
}

export async function submitGarminMfa(code: string): Promise<void> {
    await api.post('/garmin/connect/mfa', { code })
}

export async function disconnectGarmin(): Promise<void> {
    await api.delete('/garmin/connect')
}

/** Garmin state of each conditioning entry in [start, end], by entry id. */
export async function listGarminStates(start: string, end: string): Promise<Record<string, GarminEntryState>> {
    const res = await api.get<ApiResponse<Record<string, GarminEntryState>>>('/garmin/entries', {
        params: { start, end },
    })
    return res.data.data
}

export async function getGarminPreview(entryId: string): Promise<GarminPreview> {
    return (await api.get<ApiResponse<GarminPreview>>(`/garmin/entries/${entryId}/preview`)).data.data
}

export async function sendToGarmin(entryId: string): Promise<GarminSendResult> {
    const res = await api.post<ApiResponse<Omit<GarminSendResult, 'message'>>>(`/garmin/entries/${entryId}/send`)
    return { ...res.data.data, message: res.data.message }
}

/**
 * Look for finished runs on [from, to] and link what matches. `force` asks
 * Garmin again even if it was asked a few minutes ago.
 */
export async function checkGarminRuns(from: string, to: string, force = false): Promise<GarminRunCheck> {
    const res = await api.post<ApiResponse<GarminRunCheck>>('/garmin/activities/check', { from, to, force })
    return res.data.data
}

export async function getEntryRun(entryId: string): Promise<GarminRun | null> {
    return (await api.get<ApiResponse<GarminRun | null>>(`/garmin/activities/entry/${entryId}`)).data.data
}

export async function linkEntryRun(entryId: string, activityId: string): Promise<GarminRun> {
    const res = await api.post<ApiResponse<GarminRun>>(`/garmin/activities/entry/${entryId}/link`, { activityId })
    return res.data.data
}

export async function unlinkEntryRun(entryId: string): Promise<void> {
    await api.post(`/garmin/activities/entry/${entryId}/unlink`)
}

/** Fired on window when runs were linked, so screens showing done state reload. */
export const GARMIN_RUNS_LINKED = 'garmin-runs-linked'

let quietFor: string | null = null
/**
 * The background check screens make on open: never throws, never shows an
 * error, and skips when Garmin isn't connected. Once per range per page load;
 * the server keeps its own cooldown too.
 */
export async function checkGarminRunsQuietly(from: string, to: string): Promise<GarminRunCheck | null> {
    const key = `${from}|${to}`
    if (quietFor === key) return null
    quietFor = key
    try {
        const status = await getGarminStatus()
        if (status.status !== 'connected') return null
        const result = await checkGarminRuns(from, to)
        if (result.linked.length) window.dispatchEvent(new CustomEvent(GARMIN_RUNS_LINKED, { detail: result.linked }))
        return result
    } catch {
        return null
    } finally {
        // Allow the same range again later in the session (the server decides if it's too soon).
        setTimeout(() => {
            if (quietFor === key) quietFor = null
        }, 60_000)
    }
}
