import api from './api'
import type { ApiResponse, EntryStatus, Macros, MealPlanEntry, MealType } from '../types'

/** List planned meals whose date falls in [start, end] (inclusive, YYYY-MM-DD). */
export async function listPlanEntries(start: string, end: string): Promise<MealPlanEntry[]> {
    const res = await api.get<ApiResponse<MealPlanEntry[]>>('/meal-plan', {
        params: { start, end },
    })
    return res.data.data
}

/** Place a meal into a given day + slot, optionally at a non-standard portion. */
export async function addPlanEntry(
    date: string,
    slot: MealType,
    meal: string,
    servings?: number
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>('/meal-plan', {
        date,
        slot,
        meal,
        ...(servings === undefined ? {} : { servings }),
    })
    return res.data.data
}

/**
 * Log food that wasn't on the plan. Off-plan food is by definition already
 * eaten, so it goes straight in with that status rather than as an intention.
 */
export async function addAdhocEntry(
    date: string,
    slot: MealType,
    adhoc: { name: string; macros: Partial<Macros> },
    servings?: number
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>('/meal-plan', {
        date,
        slot,
        adhoc,
        status: 'eaten',
        ...(servings === undefined ? {} : { servings }),
    })
    return res.data.data
}

/** Mark an entry eaten, skipped, or back to planned. */
export async function setEntryStatus(id: string, status: EntryStatus): Promise<MealPlanEntry> {
    const res = await api.patch<ApiResponse<MealPlanEntry>>(`/meal-plan/${id}`, { status })
    return res.data.data
}

/**
 * Change how many servings of an entry are on the plate. Sent on its own so it
 * never disturbs the logged status — bumping a portion isn't a claim you ate it.
 */
export async function setEntryServings(id: string, servings: number): Promise<MealPlanEntry> {
    const res = await api.patch<ApiResponse<MealPlanEntry>>(`/meal-plan/${id}`, { servings })
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
