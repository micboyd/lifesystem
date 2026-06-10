import api from './api'
import type { ApiResponse, DayStatus, DayStatusType } from '../types'

export async function listStatuses(from: string, to: string): Promise<DayStatus[]> {
    const res = await api.get<ApiResponse<DayStatus[]>>('/day-status', { params: { from, to } })
    return res.data.data
}

export async function createStatus(
    startDate: string,
    endDate: string,
    status: DayStatusType
): Promise<DayStatus> {
    const res = await api.post<ApiResponse<DayStatus>>('/day-status', {
        startDate,
        endDate,
        status,
    })
    return res.data.data
}

export async function updateStatus(
    id: string,
    startDate: string,
    endDate: string,
    status: DayStatusType
): Promise<DayStatus> {
    const res = await api.put<ApiResponse<DayStatus>>(`/day-status/${id}`, {
        startDate,
        endDate,
        status,
    })
    return res.data.data
}

export async function deleteStatus(id: string): Promise<void> {
    await api.delete(`/day-status/${id}`)
}
