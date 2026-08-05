import api from './api'
import type { ApiResponse, Mobility } from '../types'
import { importBody, importResult, type OverwriteMap, type ImportResult } from './imports'

/** Fields the create/update endpoints accept. */
export interface MobilityInput {
    name: string
    duration?: number
    purpose?: string
    parts?: Mobility['parts']
    howToUse?: string
}

export async function listMobility(): Promise<Mobility[]> {
    const res = await api.get<ApiResponse<Mobility[]>>('/mobility')
    return res.data.data
}

export async function createMobility(fields: MobilityInput): Promise<Mobility> {
    const res = await api.post<ApiResponse<Mobility>>('/mobility', fields)
    return res.data.data
}

export async function updateMobility(
    id: string,
    fields: Partial<MobilityInput & Pick<Mobility, 'order'>>
): Promise<Mobility> {
    const res = await api.put<ApiResponse<Mobility>>(`/mobility/${id}`, fields)
    return res.data.data
}

export async function deleteMobility(id: string): Promise<void> {
    await api.delete(`/mobility/${id}`)
}

/** Bulk-import mobility routines from a parsed JSON document. Returns the created routines. */
export async function importMobility(
    mobility: unknown,
    overwrite?: OverwriteMap
): Promise<ImportResult> {
    const res = await api.post<ApiResponse<Mobility[]> & { updated?: number }>(
        '/mobility/import',
        importBody(mobility, overwrite)
    )
    return importResult(res.data.data, res.data)
}
