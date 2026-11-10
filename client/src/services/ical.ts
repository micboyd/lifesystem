import api from './api'
import type { ApiResponse } from '../types'

/** The Google Calendar feed as the server describes it — the address only ever masked. */
export interface MeetingsFeed {
    connected: boolean
    maskedUrl?: string
    /** Id of the calendar (layer) meetings land on. */
    calendar?: string
    lastSyncedAt?: string | null
    lastError?: string | null
    lastCount?: number
}

export interface MeetingsSyncResult {
    added: number
    updated: number
    removed: number
    total: number
}

export async function getMeetingsFeed(): Promise<MeetingsFeed> {
    const res = await api.get<ApiResponse<MeetingsFeed>>('/ical')
    return res.data.data
}

/** Saves the secret iCal address and runs the first sync. Rejects with the server's reason. */
export async function setMeetingsFeed(
    url: string
): Promise<{ status: MeetingsFeed; result: MeetingsSyncResult }> {
    const res = await api.put<ApiResponse<{ status: MeetingsFeed; result: MeetingsSyncResult }>>(
        '/ical',
        { url }
    )
    return res.data.data
}

/**
 * Syncs now. With `ifStale`, the server skips when the last attempt was under
 * 15 minutes ago — what the Calendar page sends on open.
 */
export async function syncMeetingsFeed(
    ifStale = false
): Promise<{ status: MeetingsFeed; synced: boolean; result?: MeetingsSyncResult }> {
    const res = await api.post<
        ApiResponse<{ status: MeetingsFeed; synced: boolean; result?: MeetingsSyncResult }>
    >('/ical/sync', null, ifStale ? { params: { ifStale: 1 } } : undefined)
    return res.data.data
}

export async function deleteMeetingsFeed(): Promise<void> {
    await api.delete('/ical')
}
