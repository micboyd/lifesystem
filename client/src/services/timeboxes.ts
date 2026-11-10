import api from './api'
import type { ApiResponse, Timebox, TimeboxCategory, TimeboxRepeat } from '../types'

export interface TimeboxInput {
    date: string
    title: string
    startTime: string
    endTime: string
    notes?: string
    category?: TimeboxCategory
    recurrence?: { freq: TimeboxRepeat; days?: number[]; until?: string } | null
}

export interface TimeboxImportItem {
    title: string
    start?: string
    end?: string
    startTime?: string
    endTime?: string
    notes?: string
    category?: string
    date?: string
}

export interface TimeboxImportResult {
    added: number
    skipped: number
    errors: string[]
}

/** The day's blocks, repeats included. */
export async function listTimeboxes(date: string): Promise<Timebox[]> {
    const res = await api.get<ApiResponse<Timebox[]>>('/timeboxes', { params: { date } })
    return res.data.data
}

export async function createTimebox(input: TimeboxInput): Promise<Timebox> {
    const res = await api.post<ApiResponse<Timebox>>('/timeboxes', input)
    return res.data.data
}

/** Saves the block; on a repeat this changes the whole series. */
export async function updateTimebox(id: string, input: TimeboxInput): Promise<Timebox> {
    const res = await api.put<ApiResponse<Timebox>>(`/timeboxes/${id}`, input)
    return res.data.data
}

/** Deletes the block (a repeat's whole series). */
export async function deleteTimebox(id: string): Promise<void> {
    await api.delete(`/timeboxes/${id}`)
}

/** Skips one day of a repeating block. */
export async function skipTimeboxDay(id: string, date: string): Promise<void> {
    await api.delete(`/timeboxes/${id}`, { data: { scope: 'this', date } })
}

export async function importTimeboxes(date: string, items: TimeboxImportItem[]): Promise<TimeboxImportResult> {
    const res = await api.post<ApiResponse<TimeboxImportResult>>('/timeboxes/import', { date, items })
    return res.data.data
}
