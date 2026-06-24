import api from './api'
import type { ApiResponse, DaysSinceItem, DaysSinceColor } from '../types'

export interface DaysSincePayload {
    label: string
    startDate: string
    icon: string
    color: DaysSinceColor
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
