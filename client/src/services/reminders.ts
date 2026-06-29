import api from './api'
import type { ApiResponse, Reminder } from '../types'

export async function listReminders(from: string, to: string): Promise<Reminder[]> {
    const res = await api.get<ApiResponse<Reminder[]>>('/reminders', { params: { from, to } })
    return res.data.data
}

export async function createReminder(date: string, text: string): Promise<Reminder> {
    const res = await api.post<ApiResponse<Reminder>>('/reminders', { date, text })
    return res.data.data
}

export async function updateReminder(
    id: string,
    fields: Partial<Pick<Reminder, 'text' | 'order'>>
): Promise<Reminder> {
    const res = await api.put<ApiResponse<Reminder>>(`/reminders/${id}`, fields)
    return res.data.data
}

export async function deleteReminder(id: string): Promise<void> {
    await api.delete(`/reminders/${id}`)
}
