import api from './api'
import type {
    ApiResponse,
    NutritionPhase,
    NutritionPhaseInput,
    PhaseAdjustmentInput,
} from '../types'
import { importBody, importResult, type ImportResult, type OverwriteMap } from './imports'

/** Phases overlapping the YYYY-MM-DD range, or every phase when no range is given. */
export async function listNutritionPhases(
    from?: string,
    to?: string
): Promise<NutritionPhase[]> {
    const res = await api.get<ApiResponse<NutritionPhase[]>>('/nutrition-phases', {
        params: from && to ? { from, to } : undefined,
    })
    return res.data.data
}

export async function createNutritionPhase(input: NutritionPhaseInput): Promise<NutritionPhase> {
    const res = await api.post<ApiResponse<NutritionPhase>>('/nutrition-phases', input)
    return res.data.data
}

export async function updateNutritionPhase(
    id: string,
    input: NutritionPhaseInput
): Promise<NutritionPhase> {
    const res = await api.put<ApiResponse<NutritionPhase>>(`/nutrition-phases/${id}`, input)
    return res.data.data
}

/** Bulk-add phases from pasted JSON. Name clashes the user chose to overwrite update in place. */
export async function importNutritionPhases(
    phases: unknown,
    overwrite?: OverwriteMap
): Promise<ImportResult> {
    const res = await api.post<ApiResponse<NutritionPhase[]> & { updated?: number }>(
        '/nutrition-phases/import',
        importBody(phases, overwrite)
    )
    return importResult(res.data.data, res.data)
}

export async function deleteNutritionPhase(id: string): Promise<void> {
    await api.delete(`/nutrition-phases/${id}`)
}

/**
 * Record a target change against a phase. Appends to its history rather than
 * overwriting `targets`, so what a past day was judged against survives.
 */
export async function addPhaseAdjustment(
    id: string,
    input: PhaseAdjustmentInput
): Promise<NutritionPhase> {
    const res = await api.post<ApiResponse<NutritionPhase>>(
        `/nutrition-phases/${id}/adjustments`,
        input
    )
    return res.data.data
}
