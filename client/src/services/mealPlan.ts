import api from './api'
import type { ApiResponse, MealPlanEntry, MealType } from '../types'

/** List planned meals whose date falls in [start, end] (inclusive, YYYY-MM-DD). */
export async function listPlanEntries(start: string, end: string): Promise<MealPlanEntry[]> {
    const res = await api.get<ApiResponse<MealPlanEntry[]>>('/meal-plan', {
        params: { start, end },
    })
    return res.data.data
}

/** Place a meal into a given day + slot. */
export async function addPlanEntry(
    date: string,
    slot: MealType,
    meal: string
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>('/meal-plan', { date, slot, meal })
    return res.data.data
}

/**
 * Copy planned meals from one set of days onto another. `from` and `to` are
 * parallel arrays of dates — every entry on `from[i]` is recreated on `to[i]`,
 * and the target days are overwritten. Returns the freshly created entries.
 */
export async function copyPlanEntries(from: string[], to: string[]): Promise<MealPlanEntry[]> {
    const res = await api.post<ApiResponse<MealPlanEntry[]>>('/meal-plan/copy', { from, to })
    return res.data.data
}

/**
 * Delete every planned meal whose date falls in [start, end] (inclusive).
 * Clears a single day (start === end) or a whole week.
 */
export async function clearPlanRange(start: string, end: string): Promise<void> {
    await api.post('/meal-plan/clear', { start, end })
}

export async function deletePlanEntry(id: string): Promise<void> {
    await api.delete(`/meal-plan/${id}`)
}
