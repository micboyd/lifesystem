import api from './api'
import type { ApiResponse, DaysUntilItem, DaysUntilColor } from '../types'

export interface DaysUntilPayload {
    label: string
    targetDate: string
    icon: string
    color: DaysUntilColor
}

export async function listDaysUntil(): Promise<DaysUntilItem[]> {
    const res = await api.get<ApiResponse<DaysUntilItem[]>>('/days-until')
    return res.data.data
}

export async function createDaysUntil(payload: DaysUntilPayload): Promise<DaysUntilItem> {
    const res = await api.post<ApiResponse<DaysUntilItem>>('/days-until', payload)
    return res.data.data
}

export async function updateDaysUntil(
    id: string,
    payload: Partial<DaysUntilPayload>
): Promise<DaysUntilItem> {
    const res = await api.put<ApiResponse<DaysUntilItem>>(`/days-until/${id}`, payload)
    return res.data.data
}

export async function deleteDaysUntil(id: string): Promise<void> {
    await api.delete(`/days-until/${id}`)
}
