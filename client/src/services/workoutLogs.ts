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
    /**
     * Mid-session swaps, aligned by index the same way. Entry i is the library
     * exercise id actually performed for exercise i, or null when it was done as
     * prescribed. Omit when nothing was swapped.
     */
    substitutions?: (string | null)[]
    /**
     * Exercises to leave out of the record — indices into the same array the
     * fields above are aligned to. A row skipped mid-session (machine taken, ran
     * out of time) is dropped from the log rather than saved empty.
     */
    omitted?: number[]
    /**
     * Update only: re-derive the exercise lines from the linked workout instead of
     * overlaying onto the ones already stored. The in-session logger sends the whole
     * picture on every save, so a row skipped — or put back — after the first save
     * still lands correctly. The edit drawer, which only touches weights, omits it.
     */
    rebuild?: boolean
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
