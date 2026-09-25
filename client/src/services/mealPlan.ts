import api from './api'
import type { ApiResponse, EntryStatus, MealPlanEntry, MealType } from '../types'

/** Meals on days in [start, end] (inclusive, YYYY-MM-DD). */
export async function listPlanEntries(start: string, end: string): Promise<MealPlanEntry[]> {
    const res = await api.get<ApiResponse<MealPlanEntry[]>>('/meal-plan', { params: { start, end } })
    return res.data.data
}

/** Plan a library meal on a day, or — with `extra` — log it as eaten straight away. */
export async function addPlanEntry(
    date: string,
    slot: MealType,
    meal: string,
    extra = false
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>('/meal-plan', { date, slot, meal, extra })
    return res.data.data
}

/** The tick: eaten, or back to planned. */
export async function setEntryStatus(id: string, status: EntryStatus): Promise<MealPlanEntry> {
    const res = await api.patch<ApiResponse<MealPlanEntry>>(`/meal-plan/${id}`, { status })
    return res.data.data
}

export async function deletePlanEntry(id: string): Promise<void> {
    await api.delete(`/meal-plan/${id}`)
}
