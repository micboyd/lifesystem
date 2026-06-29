import api from './api'
import type { ApiResponse, Reminder, Recurrence } from '../types'

export interface ReminderInput {
    date: string
    text: string
    recurrence?: Recurrence
}

export async function listReminders(from: string, to: string): Promise<Reminder[]> {
    const res = await api.get<ApiResponse<Reminder[]>>('/reminders', { params: { from, to } })
    return res.data.data
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
    const res = await api.post<ApiResponse<Reminder>>('/reminders', input)
    return res.data.data
}

export async function updateReminder(
    id: string,
    fields: Partial<Pick<Reminder, 'text' | 'order' | 'date' | 'recurrence'>>
): Promise<Reminder> {
    const res = await api.put<ApiResponse<Reminder>>(`/reminders/${id}`, fields)
    return res.data.data
}

/**
 * Deletes a reminder. Pass `date` (YYYY-MM-DD) to remove only that one
 * occurrence of a recurring series; omit it to delete the reminder / whole series.
 */
export async function deleteReminder(id: string, date?: string): Promise<void> {
    await api.delete(`/reminders/${id}`, date ? { params: { date } } : undefined)
}
