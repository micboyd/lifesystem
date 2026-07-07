import api from './api'
import type { ApiResponse, DaysSinceItem, DaysSinceColor, DaysSinceCheckIn } from '../types'

export interface DaysSincePayload {
    label: string
    startDate: string
    icon: string
    color: DaysSinceColor
}

export interface DaysSinceResetPayload {
    startDate: string
    reason?: string
}

export interface DaysSinceCheckInPayload {
    date: string
    intensity: number
    note?: string
}

export async function listDaysSince(): Promise<DaysSinceItem[]> {
    const res = await api.get<ApiResponse<DaysSinceItem[]>>('/days-since')
    return res.data.data
}

export async function createDaysSince(payload: DaysSincePayload): Promise<DaysSinceItem> {
    const res = await api.post<ApiResponse<DaysSinceItem>>('/days-since', payload)
    return res.data.data
}

export async function updateDaysSince(
    id: string,
    payload: Partial<DaysSincePayload>
): Promise<DaysSinceItem> {
    const res = await api.put<ApiResponse<DaysSinceItem>>(`/days-since/${id}`, payload)
    return res.data.data
}

export async function deleteDaysSince(id: string): Promise<void> {
    await api.delete(`/days-since/${id}`)
}

export async function resetDaysSince(
    id: string,
    payload: DaysSinceResetPayload
): Promise<DaysSinceItem> {
    const res = await api.post<ApiResponse<DaysSinceItem>>(`/days-since/${id}/reset`, payload)
    return res.data.data
}

export async function listCheckIns(since: string): Promise<DaysSinceCheckIn[]> {
    const res = await api.get<ApiResponse<DaysSinceCheckIn[]>>('/days-since/checkins', {
        params: { since },
    })
    return res.data.data
}

export async function upsertCheckIn(
    id: string,
    payload: DaysSinceCheckInPayload
): Promise<DaysSinceCheckIn> {
    const res = await api.post<ApiResponse<DaysSinceCheckIn>>(`/days-since/${id}/checkins`, payload)
    return res.data.data
}
