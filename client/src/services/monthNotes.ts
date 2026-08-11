import api from './api'
import type { ApiResponse, MonthNote, MonthNoteInput } from '../types'

/** Notes overlapping the YYYY-MM range — a flag spanning it counts, not just one starting in it. */
export async function listMonthNotes(from: string, to: string): Promise<MonthNote[]> {
    const res = await api.get<ApiResponse<MonthNote[]>>('/month-notes', { params: { from, to } })
    return res.data.data
}

export async function createMonthNote(input: MonthNoteInput): Promise<MonthNote> {
    const res = await api.post<ApiResponse<MonthNote>>('/month-notes', input)
    return res.data.data
}

export async function updateMonthNote(id: string, input: MonthNoteInput): Promise<MonthNote> {
    const res = await api.put<ApiResponse<MonthNote>>(`/month-notes/${id}`, input)
    return res.data.data
}

export async function deleteMonthNote(id: string): Promise<void> {
    await api.delete(`/month-notes/${id}`)
}
