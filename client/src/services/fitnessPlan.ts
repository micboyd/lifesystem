import api from './api'
import type { ApiResponse, FitnessPlanEntry, FitnessPlanKind } from '../types'

/** List planned training whose date falls in [start, end] (inclusive, YYYY-MM-DD). */
export async function listPlanEntries(start: string, end: string): Promise<FitnessPlanEntry[]> {
    const res = await api.get<ApiResponse<FitnessPlanEntry[]>>('/fitness-plan', {
        params: { start, end },
    })
    return res.data.data
}

/** Place a workout or conditioning session onto a given day. */
export async function addPlanEntry(
    date: string,
    kind: FitnessPlanKind,
    item: string
): Promise<FitnessPlanEntry> {
    const res = await api.post<ApiResponse<FitnessPlanEntry>>('/fitness-plan', { date, kind, item })
    return res.data.data
}

export async function deletePlanEntry(id: string): Promise<void> {
    await api.delete(`/fitness-plan/${id}`)
}
