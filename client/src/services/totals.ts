import api from './api'
import type { ApiResponse, TotalRow, TotalValue } from '../types'

export async function listRows(): Promise<TotalRow[]> {
    const res = await api.get<ApiResponse<TotalRow[]>>('/totals')
    return res.data.data
}

export async function createRow(
    name: string,
    granularity: 'daily' | 'weekly' = 'daily'
): Promise<TotalRow> {
    const res = await api.post<ApiResponse<TotalRow>>('/totals', { name, granularity })
    return res.data.data
}

export async function updateRow(
    id: string,
    fields: { name?: string; order?: number; granularity?: 'daily' | 'weekly' }
): Promise<TotalRow> {
    const res = await api.put<ApiResponse<TotalRow>>(`/totals/${id}`, fields)
    return res.data.data
}

export async function deleteRow(id: string): Promise<void> {
    await api.delete(`/totals/${id}`)
}

export async function listValues(from: string, to: string): Promise<TotalValue[]> {
    const res = await api.get<ApiResponse<TotalValue[]>>('/totals/values', { params: { from, to } })
    return res.data.data
}

/** Upsert a value for a row/day. Pass null to clear it. */
export async function setValue(
    rowId: string,
    date: string,
    value: number | null
): Promise<TotalValue | null> {
    const res = await api.put<ApiResponse<TotalValue | null>>(`/totals/${rowId}/values/${date}`, {
        value,
    })
    return res.data.data
}
