import api from './api'
import type { ApiResponse, Event, EventType, Part, Recurrence } from '../types'

export interface EventInput {
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

export async function deleteEvent(id: string): Promise<void> {
    await api.delete<ApiResponse<Event>>(`/events/${id}`)
}
