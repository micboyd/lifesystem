import api from './api'
import type { ApiResponse, ConditioningSession } from '../types'
import { importBody, importResult, type OverwriteMap, type ImportResult } from './imports'

/** Fields the create/update endpoints accept. */
export interface ConditioningInput {
    name: string
    duration?: number
    category?: ConditioningSession['category']
    purpose?: string
    parts?: ConditioningSession['parts']
    howToUse?: string
}

export async function listSessions(): Promise<ConditioningSession[]> {
    const res = await api.get<ApiResponse<ConditioningSession[]>>('/conditioning')
    return res.data.data
}

export async function createSession(fields: ConditioningInput): Promise<ConditioningSession> {
    const res = await api.post<ApiResponse<ConditioningSession>>('/conditioning', fields)
    return res.data.data
}

export async function updateSession(
    id: string,
    fields: Partial<ConditioningInput & Pick<ConditioningSession, 'order'>>
): Promise<ConditioningSession> {
    const res = await api.put<ApiResponse<ConditioningSession>>(`/conditioning/${id}`, fields)
    return res.data.data
}

export async function deleteSession(id: string): Promise<void> {
    await api.delete(`/conditioning/${id}`)
}

/** Bulk-import sessions from a parsed JSON document. Returns the created sessions. */
export async function importSessions(
    sessions: unknown,
    overwrite?: OverwriteMap
): Promise<ImportResult> {
    const res = await api.post<ApiResponse<ConditioningSession[]> & { updated?: number }>(
        '/conditioning/import',
        importBody(sessions, overwrite)
    )
    return importResult(res.data.data, res.data)
}
