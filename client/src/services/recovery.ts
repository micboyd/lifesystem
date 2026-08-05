import api from './api'
import type { ApiResponse, Recovery } from '../types'
import { importBody, importResult, type OverwriteMap, type ImportResult } from './imports'

/** Fields the create/update endpoints accept. */
export interface RecoveryInput {
    name: string
    duration?: number
    purpose?: string
    notes?: string
}

export async function listRecovery(): Promise<Recovery[]> {
    const res = await api.get<ApiResponse<Recovery[]>>('/recovery')
    return res.data.data
}

export async function createRecovery(fields: RecoveryInput): Promise<Recovery> {
    const res = await api.post<ApiResponse<Recovery>>('/recovery', fields)
    return res.data.data
}

/** Bulk-import recovery items from a parsed JSON document. */
export async function importRecovery(
    recovery: unknown,
    overwrite?: OverwriteMap
): Promise<ImportResult> {
    const res = await api.post<ApiResponse<Recovery[]> & { updated?: number }>(
        '/recovery/import',
        importBody(recovery, overwrite)
    )
    return importResult(res.data.data, res.data)
}

export async function updateRecovery(
    id: string,
    fields: Partial<RecoveryInput & Pick<Recovery, 'order'>>
): Promise<Recovery> {
    const res = await api.put<ApiResponse<Recovery>>(`/recovery/${id}`, fields)
    return res.data.data
}

export async function deleteRecovery(id: string): Promise<void> {
    await api.delete(`/recovery/${id}`)
}
