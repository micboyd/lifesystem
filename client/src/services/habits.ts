import api from './api'
import type { ApiResponse, HabitDef, HabitLog } from '../types'

// ─── Definitions ─────────────────────────────────────────────────────────────

export async function listHabits(): Promise<HabitDef[]> {
    const res = await api.get<ApiResponse<HabitDef[]>>('/habits')
    return res.data.data
}

export async function createHabit(
    name: string,
    description?: string,
    icon?: string
): Promise<HabitDef> {
    const res = await api.post<ApiResponse<HabitDef>>('/habits', { name, description, icon })
    return res.data.data
}

export async function updateHabit(
    id: string,
    // `icon: null` clears a chosen icon (back to the automatic name-based one).
    fields: Partial<Pick<HabitDef, 'name' | 'description' | 'active' | 'order'>> & {
        icon?: string | null
    }
): Promise<HabitDef> {
    const res = await api.put<ApiResponse<HabitDef>>(`/habits/${id}`, fields)
    return res.data.data
}

export async function deleteHabit(id: string): Promise<void> {
    await api.delete(`/habits/${id}`)
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function listLogs(from: string, to: string): Promise<HabitLog[]> {
    const res = await api.get<ApiResponse<HabitLog[]>>('/habits/logs', { params: { from, to } })
    return res.data.data
}

export async function checkHabit(habitId: string, date: string): Promise<HabitLog> {
    const res = await api.put<ApiResponse<HabitLog>>(`/habits/${habitId}/logs/${date}`)
    return res.data.data
}

export async function uncheckHabit(habitId: string, date: string): Promise<void> {
    await api.delete(`/habits/${habitId}/logs/${date}`)
}
