import api from './api'
import type { ApiResponse, EntryStatus, MealPlanEntry, MealType, PlateLineInput } from '../types'

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
    extra = false,
    /** Quick log: in its slot, already ticked. */
    eaten = false
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>('/meal-plan', { date, slot, meal, extra, eaten })
    return res.data.data
}

/** Put a plate of weighed foods on a day — or, with `extra`, log it as eaten. */
export async function addPlatePlanEntry(
    date: string,
    slot: MealType,
    plate: PlateLineInput[],
    extra = false,
    eaten = false
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>('/meal-plan', { date, slot, plate, extra, eaten })
    return res.data.data
}

/** "Eating from this box" on each of `dates` — light notes with no grams or macros. */
export async function addBoxNotes(box: string, slot: MealType, dates: string[]): Promise<MealPlanEntry[]> {
    const res = await api.post<ApiResponse<MealPlanEntry[]>>('/meal-plan/box', { box, slot, dates })
    return res.data.data
}

/**
 * "At an event, so no meal here" — fills the slot with a note named after the
 * event. The slot's still-planned meals make way; their ids come back.
 */
export async function addAwayNote(
    date: string,
    slot: MealType,
    name: string
): Promise<{ entry: MealPlanEntry; removed: string[] }> {
    const res = await api.post<ApiResponse<{ entry: MealPlanEntry; removed: string[] }>>('/meal-plan/away', {
        date,
        slot,
        name,
    })
    return res.data.data
}

/** Change a plate's grams. Lines that name a batch keep it. */
export async function updatePlate(id: string, plate: PlateLineInput[]): Promise<MealPlanEntry> {
    const res = await api.patch<ApiResponse<MealPlanEntry>>(`/meal-plan/${id}`, { plate })
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

/** A slot's planned meals in their new order; a meal dragged in from elsewhere moves there. */
export async function reorderPlanSlot(date: string, slot: MealType, ids: string[]): Promise<void> {
    await api.post('/meal-plan/reorder', { date, slot, ids })
}

/**
 * Put the planned meals in `slots` from the week starting `from` onto the week
 * starting `to`, replacing that week's still-planned meals in those slots.
 */
export async function copyPlanWeek(from: string, to: string, slots: MealType[]): Promise<void> {
    await api.post('/meal-plan/copy-week', { from, to, slots })
}

/** Remove the planned meals not yet eaten from [start, end]. */
export async function clearPlanRange(start: string, end: string): Promise<void> {
    await api.post('/meal-plan/clear', { start, end })
}
