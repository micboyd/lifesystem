import api from './api'
import type { ApiResponse, Recovery } from '../types'

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
