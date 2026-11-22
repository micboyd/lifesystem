import api from './api'
import type {
    ApiResponse,
    MenuApplied,
    MenuItem,
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
    overwrite?: OverwriteMap,
    /** Import even though some meal-week meals aren't in the Library, leaving them out. */
    skipMissingMeals = false
): Promise<ImportResult> {
    const body = skipMissingMeals
        ? { items: phases, ...(overwrite && Object.keys(overwrite).length ? { overwrite } : {}), skipMissingMeals: true }
        : importBody(phases, overwrite)
    const res = await api.post<ApiResponse<NutritionPhase[]> & { updated?: number; placed?: number }>(
        '/nutrition-phases/import',
        body
    )
    return importResult(res.data.data, res.data)
}

/** Delete every phase. */
/** Delete every phase — and their still-planned meals. Answers how many meals came off the planner. */
export async function deleteAllNutritionPhases(): Promise<number> {
    const res = await api.delete('/nutrition-phases')
    return res.data?.data?.removed ?? 0
}

/** Delete a phase and the still-planned meals it put on the planner. Answers how many came off. */
export async function deleteNutritionPhase(id: string): Promise<number> {
    const res = await api.delete(`/nutrition-phases/${id}`)
    return res.data?.data?.removed ?? 0
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

// ─── Meal week ──────────────────────────────────────────────────────────────────

/** Replace a plan's meal week. */
export async function saveMenu(id: string, menu: MenuItem[]): Promise<NutritionPhase> {
    const res = await api.put<ApiResponse<NutritionPhase>>(`/nutrition-phases/${id}/menu`, { menu })
    return res.data.data
}

/** What of the plan's meal week is on the planner from today. */
export async function getMenuApplied(id: string): Promise<MenuApplied> {
    const res = await api.get<ApiResponse<MenuApplied>>(`/nutrition-phases/${id}/applied`)
    return res.data.data
}

export interface ApplyResult {
    added: number
    replaced: number
    skipped: number
    /** Slots a calendar event covers — given an away note instead of a meal. */
    away?: number
    from: string
    to: string
    applied: MenuApplied
}

/** Copy the meal week onto the planner from `from` to the plan's end. */
export async function applyMenu(id: string, from: string): Promise<ApplyResult> {
    const res = await api.post<ApiResponse<ApplyResult>>(`/nutrition-phases/${id}/apply`, { from })
    return res.data.data
}

/** Take the plan's still-planned meals off the planner from today. */
export async function unapplyMenu(id: string): Promise<number> {
    const res = await api.post<ApiResponse<{ removed: number }>>(`/nutrition-phases/${id}/unapply`, {})
    return res.data.data.removed
}
