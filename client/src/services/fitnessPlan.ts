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

export async function deletePlanEntry(id: string): Promise<void> {
    await api.delete(`/fitness-plan/${id}`)
}
