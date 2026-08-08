import api from './api'
import type { ApiResponse, MobilityLog } from '../types'

/** Fields the create/update endpoints accept. */
export interface MobilityLogInput {
    /** Library routine id to link and snapshot from, if any. */
    mobility?: string | null
    name?: string
    /** YYYY-MM-DD. */
    date: string
    duration?: number
    notes?: string
}

export async function listLogs(): Promise<MobilityLog[]> {
    const res = await api.get<ApiResponse<MobilityLog[]>>('/mobility-logs')
    return res.data.data
}

export async function createLog(fields: MobilityLogInput): Promise<MobilityLog> {
    const res = await api.post<ApiResponse<MobilityLog>>('/mobility-logs', fields)
    return res.data.data
}

export async function updateLog(
    id: string,
    fields: Partial<MobilityLogInput>
): Promise<MobilityLog> {
    const res = await api.put<ApiResponse<MobilityLog>>(`/mobility-logs/${id}`, fields)
    return res.data.data
}

export async function deleteLog(id: string): Promise<void> {
    await api.delete(`/mobility-logs/${id}`)
}
