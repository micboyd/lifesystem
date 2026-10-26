import api from './api'
import type { ApiResponse, Checkpoint, ConditioningLog, RoundProgress } from '../types'

/** Fields the create/update endpoints accept. */
export interface ConditioningLogInput {
    /** Library session id to link and snapshot from, if any. */
    session?: string | null
    name?: string
    category?: ConditioningLog['category']
    /** YYYY-MM-DD. */
    date: string
    duration?: number
    rpe?: number
    /** Completed rounds per counted part, if tracked. */
    rounds?: RoundProgress[]
    /** Each part's slot and when it was tapped completed. */
    checkpoints?: Checkpoint[]
    notes?: string
}

/** Every log, or only those dated `from`–`to` (inclusive). */
export async function listLogs(range?: { from: string; to: string }): Promise<ConditioningLog[]> {
    const res = await api.get<ApiResponse<ConditioningLog[]>>('/conditioning-logs', { params: range })
    return res.data.data
}

export async function createLog(fields: ConditioningLogInput): Promise<ConditioningLog> {
    const res = await api.post<ApiResponse<ConditioningLog>>('/conditioning-logs', fields)
    return res.data.data
}

export async function updateLog(
    id: string,
    fields: Partial<ConditioningLogInput>
): Promise<ConditioningLog> {
    const res = await api.put<ApiResponse<ConditioningLog>>(`/conditioning-logs/${id}`, fields)
    return res.data.data
}

export async function deleteLog(id: string): Promise<void> {
    await api.delete(`/conditioning-logs/${id}`)
}
