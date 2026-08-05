import api from './api'
import type { ApiResponse, LoggedSet, WorkoutLog } from '../types'

/** Fields the create/update endpoints accept. */
export interface WorkoutLogInput {
    /** Library workout id to link and snapshot from. */
    workout?: string
    name?: string
    /** YYYY-MM-DD. */
    date: string
    durationMin?: number
    notes?: string
    /**
     * Per-exercise sets performed, aligned by index to the workout's exercises.
     * Entry i is the sets done for exercise i. Omit to log without weights.
     */
    loggedSets?: LoggedSet[][]
}

export async function listLogs(): Promise<WorkoutLog[]> {
    const res = await api.get<ApiResponse<WorkoutLog[]>>('/workout-logs')
    return res.data.data
}

export async function createLog(fields: WorkoutLogInput): Promise<WorkoutLog> {
    const res = await api.post<ApiResponse<WorkoutLog>>('/workout-logs', fields)
    return res.data.data
}

export async function updateLog(
    id: string,
    fields: Partial<WorkoutLogInput>
): Promise<WorkoutLog> {
    const res = await api.put<ApiResponse<WorkoutLog>>(`/workout-logs/${id}`, fields)
    return res.data.data
}

export async function deleteLog(id: string): Promise<void> {
    await api.delete(`/workout-logs/${id}`)
}
