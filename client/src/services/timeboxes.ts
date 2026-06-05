import api from './api'
import type { ApiResponse, Timebox } from '../types'

export interface TimeboxInput {
    title: string
    startTime: string
    endTime: string
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

export async function deleteTimebox(id: string): Promise<void> {
    await api.delete(`/timeboxes/${id}`)
}
