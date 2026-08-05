import api from './api'
import type { ApiResponse, Exercise } from '../types'
import { importBody, importResult, type OverwriteMap, type ImportResult } from './imports'

/** Fields the create/update endpoints accept. */
export interface ExerciseInput {
    name: string
    description?: string
}

export async function listExercises(): Promise<Exercise[]> {
    const res = await api.get<ApiResponse<Exercise[]>>('/exercises')
    return res.data.data
}

export async function createExercise(fields: ExerciseInput): Promise<Exercise> {
    const res = await api.post<ApiResponse<Exercise>>('/exercises', fields)
    return res.data.data
}

export async function updateExercise(
    id: string,
    fields: Partial<ExerciseInput & Pick<Exercise, 'order'>>
): Promise<Exercise> {
    const res = await api.put<ApiResponse<Exercise>>(`/exercises/${id}`, fields)
    return res.data.data
}

export async function deleteExercise(id: string): Promise<void> {
    await api.delete(`/exercises/${id}`)
}

/** Bulk-import exercises from a parsed JSON document. Returns the created exercises. */
export async function importExercises(
    exercises: unknown,
    overwrite?: OverwriteMap
): Promise<ImportResult> {
    const res = await api.post<ApiResponse<Exercise[]> & { updated?: number }>(
        '/exercises/import',
        importBody(exercises, overwrite)
    )
    return importResult(res.data.data, res.data)
}
