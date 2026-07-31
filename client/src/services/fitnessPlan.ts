import api from './api'
import type { ApiResponse, FitnessPlanEntry, FitnessPlanKind, FitnessPlanPart } from '../types'

/** List planned training whose date falls in [start, end] (inclusive, YYYY-MM-DD). */
export async function listPlanEntries(start: string, end: string): Promise<FitnessPlanEntry[]> {
    const res = await api.get<ApiResponse<FitnessPlanEntry[]>>('/fitness-plan', {
        params: { start, end },
    })
    return res.data.data
}

/** Place a workout, conditioning session or recovery item into a day's slot. */
export async function addPlanEntry(
    date: string,
    kind: FitnessPlanKind,
    item: string,
    part: FitnessPlanPart
): Promise<FitnessPlanEntry> {
    const res = await api.post<ApiResponse<FitnessPlanEntry>>('/fitness-plan', {
        date,
        kind,
        item,
        part,
    })
    return res.data.data
}

/** Move a planned entry to a different slot (morning / afternoon / evening) of its day. */
export async function updatePlanEntry(
    id: string,
    part: FitnessPlanPart
): Promise<FitnessPlanEntry> {
    const res = await api.patch<ApiResponse<FitnessPlanEntry>>(`/fitness-plan/${id}`, { part })
    return res.data.data
}

export async function deletePlanEntry(id: string): Promise<void> {
    await api.delete(`/fitness-plan/${id}`)
}

/**
 * Copy one week's plan onto another for the chosen categories only. Each item
 * keeps its weekday, slot and order; only the selected `kinds` in the target
 * week are overwritten. `from` and `to` are the Mondays of each week.
 */
export async function copyPlanWeek(
    from: string,
    to: string,
    kinds: FitnessPlanKind[]
): Promise<void> {
    await api.post('/fitness-plan/copy-week', { from, to, kinds })
}
