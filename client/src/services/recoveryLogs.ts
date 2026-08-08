import api from './api'
import type { ApiResponse, RecoveryLog } from '../types'

/** Fields the create/update endpoints accept. */
export interface RecoveryLogInput {
    /** Library recovery item id to link and snapshot from, if any. */
    recovery?: string | null
    name?: string
    /** YYYY-MM-DD. */
    date: string
    duration?: number
    notes?: string
}

export async function listLogs(): Promise<RecoveryLog[]> {
    const res = await api.get<ApiResponse<RecoveryLog[]>>('/recovery-logs')
    return res.data.data
}

export async function createLog(fields: RecoveryLogInput): Promise<RecoveryLog> {
    const res = await api.post<ApiResponse<RecoveryLog>>('/recovery-logs', fields)
    return res.data.data
}

export async function updateLog(
    id: string,
    fields: Partial<RecoveryLogInput>
): Promise<RecoveryLog> {
    const res = await api.put<ApiResponse<RecoveryLog>>(`/recovery-logs/${id}`, fields)
    return res.data.data
}

export async function deleteLog(id: string): Promise<void> {
    await api.delete(`/recovery-logs/${id}`)
}
