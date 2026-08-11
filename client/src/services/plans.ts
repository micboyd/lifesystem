import api from './api'
import type { ApiResponse, FitnessPlanKind, TrainingPlan } from '../types'

/** What importing a plan added to each library, and how much it scheduled. */
export interface PlanImportSummary {
    exercisesCreated: number
    workoutsCreated: number
    conditioningCreated: number
    mobilityCreated: number
    recoveryCreated: number
    /** New library items across all five libraries. */
    itemsCreated: number
    /** Existing library items refreshed from the plan, when that was asked for. */
    itemsUpdated: number
    /** True when this import replaced an existing plan rather than adding one. */
    replacedPlan: boolean
    /** Planner entries cleared because the replaced plan's schedule changed. */
    staleEntries: number
    itemsLinked: number
    scheduled: number
    /** How many dated exceptions the plan carries. */
    overrides: number
    warnings: number
}

/** The plan library, newest additions last. `schedule` is not included. */
export async function listPlans(): Promise<TrainingPlan[]> {
    const res = await api.get<ApiResponse<TrainingPlan[]>>('/plans')
    return res.data.data
}

/** One plan in full, including its day-by-day schedule. */
export async function getPlan(id: string): Promise<TrainingPlan> {
    const res = await api.get<ApiResponse<TrainingPlan>>(`/plans/${id}`)
    return res.data.data
}

/**
 * Import a pasted plan document. Any library item the plan names that isn't
 * already there is created, and the plan is saved with its schedule worked out.
 * Nothing lands on the weekly planner until the plan is applied.
 */
export interface ImportPlanOptions {
    /**
     * Refresh library items whose names already exist, instead of keeping them as
     * they are. Items keep their ids, so planner entries and logs stay linked.
     */
    updateExisting?: boolean
    /** Id of a plan to overwrite in place, rather than adding a second one. */
    replaceId?: string | null
}

export async function importPlan(
    doc: unknown,
    options: ImportPlanOptions = {}
): Promise<{ plan: TrainingPlan; summary: PlanImportSummary }> {
    const params: Record<string, string> = {}
    if (options.updateExisting) params.updateExisting = '1'
    if (options.replaceId) params.replace = options.replaceId
    const res = await api.post<ApiResponse<TrainingPlan> & { summary: PlanImportSummary }>(
        '/plans/import',
        doc,
        { params }
    )
    return { plan: res.data.data, summary: res.data.summary }
}

/** A plan rebuilt as an import document, plus whatever couldn't be carried across. */
export interface PlanExport {
    document: Record<string, unknown>
    warnings: string[]
}

/**
 * Pull a plan back out in the shape `importPlan` accepts, so it can be edited as
 * a whole and pasted back over itself. Library sections are rebuilt from the
 * libraries as they stand now, not as they were pasted.
 */
export async function exportPlan(id: string): Promise<PlanExport> {
    const res = await api.get<ApiResponse<Record<string, unknown>> & { warnings: string[] }>(
        `/plans/${id}/export`
    )
    return { document: res.data.data, warnings: res.data.warnings ?? [] }
}

export async function renamePlan(id: string, name: string): Promise<TrainingPlan> {
    const res = await api.patch<ApiResponse<TrainingPlan>>(`/plans/${id}`, { name })
    return res.data.data
}

/** Delete a plan and any planner entries it placed. Library items are kept. */
export async function deletePlan(id: string): Promise<void> {
    await api.delete(`/plans/${id}`)
}

/** How much of a plan to roll out. Omitted fields default to the whole plan. */
export interface ApplyPlanOptions {
    /** "YYYY-MM-DD" — defaults to the plan's own start. */
    start?: string
    /** "YYYY-MM-DD" — defaults to the plan's own end. */
    end?: string
    /** Which libraries to place. Defaults to all four. */
    kinds?: FitnessPlanKind[]
    /** Also clear entries this plan didn't place, rather than only its own. */
    replace?: boolean
}

export interface ApplyPlanResult {
    placed: number
    removed: number
    start: string
    end: string
    kinds: FitnessPlanKind[]
    /**
     * "YYYY-MM-DD" of the first session placed, or null when nothing was. A plan's
     * first session can fall well after today, so this is the week the planner
     * should open on — otherwise it opens on this week and looks empty.
     */
    firstDate: string | null
}

/**
 * Push a plan's schedule onto the weekly planner. Applying twice over the same
 * window is safe: the plan's own previous entries there are cleared first.
 */
export async function applyPlan(
    id: string,
    options: ApplyPlanOptions = {}
): Promise<ApplyPlanResult> {
    const res = await api.post<ApiResponse<ApplyPlanResult>>(`/plans/${id}/apply`, options)
    return res.data.data
}

/** Remove every planner entry this plan placed, leaving hand-placed ones alone. */
export async function unapplyPlan(id: string): Promise<number> {
    const res = await api.delete<ApiResponse<{ removed: number }>>(`/plans/${id}/apply`)
    return res.data.data.removed
}
