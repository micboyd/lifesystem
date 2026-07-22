import api from './api'
import type { ApiResponse, Calendar, CalendarColor } from '../types'

export interface CalendarInput {
    name?: string
    color?: CalendarColor
    visible?: boolean
    order?: number
    isDefault?: boolean
}

export async function listCalendars(): Promise<Calendar[]> {
    const res = await api.get<ApiResponse<Calendar[]>>('/calendars')
    return res.data.data
}

export async function createCalendar(name: string, color: CalendarColor): Promise<Calendar> {
    const res = await api.post<ApiResponse<Calendar>>('/calendars', { name, color })
    return res.data.data
}

export async function updateCalendar(id: string, input: CalendarInput): Promise<Calendar> {
    const res = await api.put<ApiResponse<Calendar>>(`/calendars/${id}`, input)
    return res.data.data
}

/** Deletes a calendar; its events move to the default one. */
export async function deleteCalendar(id: string): Promise<{ movedEvents: number }> {
    const res = await api.delete<ApiResponse<{ movedEvents: number }>>(`/calendars/${id}`)
    return res.data.data
}
