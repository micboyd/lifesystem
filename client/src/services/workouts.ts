import api from './api'
import type { ApiResponse, Workout, WorkoutExercise } from '../types'
import { importResult, type OverwriteMap, type ImportResult } from './imports'

/** Fields the create/update endpoints accept. */
export interface WorkoutInput {
    name: string
    description?: string
    showInPlanner?: boolean
    /** Ordered exercises drawn from the library, each with optional sets/reps. */
    exercises?: WorkoutExercise[]
}

/** The server's paginated list envelope: workouts plus page metadata. */
interface WorkoutListResponse extends ApiResponse<Workout[]> {
    page: number
    pages: number
    total: number
}

/** One page of the workout library. */
export interface WorkoutsPage {
    workouts: Workout[]
    page: number
    pages: number
    total: number
}

/** The whole library in one go — for the planner, the export centre and the log. */
export async function listWorkouts(): Promise<Workout[]> {
    const res = await api.get<WorkoutListResponse>('/workouts', { params: { all: 1 } })
    return res.data.data
}

/**
 * A single page of the library (20 per page), optionally filtered by a search
 * term that the server matches against the workout's name and description and
 * the names of the exercises it contains.
 */
export async function listWorkoutsPage(page: number, search?: string): Promise<WorkoutsPage> {
    const res = await api.get<WorkoutListResponse>('/workouts', {
        params: { page, search: search?.trim() || undefined },
    })
    const d = res.data
    return { workouts: d.data, page: d.page, pages: d.pages, total: d.total }
}

export async function createWorkout(fields: WorkoutInput): Promise<Workout> {
    const res = await api.post<ApiResponse<Workout>>('/workouts', fields)
    return res.data.data
}

export async function updateWorkout(
    id: string,
    fields: Partial<WorkoutInput & Pick<Workout, 'order'>>
): Promise<Workout> {
    const res = await api.put<ApiResponse<Workout>>(`/workouts/${id}`, fields)
    return res.data.data
}

export async function deleteWorkout(id: string): Promise<void> {
    await api.delete(`/workouts/${id}`)
}

/** How a pasted exercise name relates to the existing exercise library. */
export type ImportExerciseStatus = 'matched' | 'ambiguous' | 'new'

export interface ImportExerciseRef {
    id: string
    name: string
}

/** One distinct exercise name from a pasted import, classified against the library. */
export interface ImportExercisePlan {
    /** Normalised match key — used to key the resolution (`links`) map on commit. */
    key: string
    /** Display name as written in the pasted JSON. */
    name: string
    status: ImportExerciseStatus
    /** Present when `status === 'matched'` — the exact library exercise. */
    match?: ImportExerciseRef
    /** Present when `status === 'ambiguous'` — close-but-inexact library exercises. */
    suggestions?: ImportExerciseRef[]
}

/** Dry-run classification of a pasted workout import, for the reconcile step. */
export interface WorkoutImportPreview {
    workouts: { name: string; exerciseCount: number }[]
    exercises: ImportExercisePlan[]
    /** The user's full exercise library, for "link to any exercise" dropdowns. */
    existing: ImportExerciseRef[]
}

/**
 * Dry-run a workout import: classify every exercise name against the library
 * without writing anything, so the user can reconcile matches before committing.
 */
export async function previewImportWorkouts(workouts: unknown): Promise<WorkoutImportPreview> {
    const res = await api.post<ApiResponse<WorkoutImportPreview>>(
        '/workouts/import/preview',
        workouts
    )
    return res.data.data
}

/**
 * Bulk-import workouts from a parsed JSON document. `links` maps a normalised
 * exercise-name key (from the preview) to the library exercise id the user chose
 * to link it to; names absent from the map are matched by name or created.
 * Returns the created workouts.
 */
export async function importWorkouts(
    workouts: unknown,
    links?: Record<string, string>,
    overwrite?: OverwriteMap
): Promise<ImportResult> {
    const hasLinks = !!links && Object.keys(links).length > 0
    const hasOverwrite = !!overwrite && Object.keys(overwrite).length > 0
    const payload =
        hasLinks || hasOverwrite
            ? {
                  workouts: Array.isArray(workouts)
                      ? workouts
                      : (workouts as { workouts?: unknown }).workouts,
                  ...(hasLinks ? { links } : {}),
                  ...(hasOverwrite ? { overwrite } : {}),
              }
            : workouts
    const res = await api.post<ApiResponse<Workout[]> & { updated?: number }>(
        '/workouts/import',
        payload
    )
    return importResult(res.data.data, res.data)
}
