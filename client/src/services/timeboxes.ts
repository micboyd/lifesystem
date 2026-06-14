import api from './api'
import type { ApiResponse, Timebox, TimeboxCategory, RecurrenceFreq } from '../types'

export interface TimeboxInput {
    title: string
    category?: TimeboxCategory
    startTime: string
    endTime: string
    recurrence?: { freq: RecurrenceFreq; days?: number[] }
}

export async function listTimeboxes(from: string, to: string): Promise<Timebox[]> {
    const res = await api.get<ApiResponse<Timebox[]>>('/timeboxes', { params: { from, to } })
    return res.data.data
}

export async function createTimebox(date: string, input: TimeboxInput): Promise<Timebox> {
    const res = await api.post<ApiResponse<Timebox>>('/timeboxes', { date, ...input })
    return res.data.data
}

export async function updateTimebox(id: string, input: TimeboxInput): Promise<Timebox> {
    const res = await api.put<ApiResponse<Timebox>>(`/timeboxes/${id}`, input)
    return res.data.data
}

export async function deleteTimebox(
    id: string,
    scope: 'all' | 'this' = 'all',
    date?: string
): Promise<void> {
    await api.delete(`/timeboxes/${id}`, { data: { scope, date } })
}
