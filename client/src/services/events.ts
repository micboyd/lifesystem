import api from './api'
import type { ApiResponse, Event, EventType, Part, Recurrence } from '../types'

export interface EventInput {
    /** Calendar (layer) to file the event under. Omitted means "leave it where it is". */
    calendar?: string
    title: string
    notes?: string
    location?: string
    eventType: EventType
    allDay: boolean
    time?: string
    startDate: string
    startPart: Part
    endDate: string
    endPart: Part
    recurrence?: Recurrence
}

export async function listEvents(from: string, to: string): Promise<Event[]> {
    const res = await api.get<ApiResponse<Event[]>>('/events', { params: { from, to } })
    return res.data.data
}

export async function createEvent(input: EventInput): Promise<Event> {
    const res = await api.post<ApiResponse<Event>>('/events', input)
    return res.data.data
}

export async function updateEvent(id: string, input: EventInput): Promise<Event> {
    const res = await api.put<ApiResponse<Event>>(`/events/${id}`, input)
    return res.data.data
}

/**
 * Deletes an event. Pass `date` (YYYY-MM-DD) to remove only that one occurrence
 * of a recurring series; omit it to delete the event / whole series.
 */
export async function deleteEvent(id: string, date?: string): Promise<void> {
    await api.delete<ApiResponse<Event>>(`/events/${id}`, date ? { params: { date } } : undefined)
}

