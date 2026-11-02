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
