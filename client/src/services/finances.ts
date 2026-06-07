import api from './api'
import type { ApiResponse, FinanceGroup, FinanceRow, FinanceEntry } from '../types'

// ── Groups ────────────────────────────────────────────────────────────────────

export async function listGroups(): Promise<FinanceGroup[]> {
    const res = await api.get<ApiResponse<FinanceGroup[]>>('/finances/groups')
    return res.data.data
}

export async function createGroup(name: string, type: 'income' | 'expense'): Promise<FinanceGroup> {
    const res = await api.post<ApiResponse<FinanceGroup>>('/finances/groups', { name, type })
    return res.data.data
}

export async function updateGroup(
    id: string,
    fields: Partial<Pick<FinanceGroup, 'name' | 'type' | 'order'>>
): Promise<FinanceGroup> {
    const res = await api.put<ApiResponse<FinanceGroup>>(`/finances/groups/${id}`, fields)
    return res.data.data
}

export async function deleteGroup(id: string): Promise<void> {
    await api.delete(`/finances/groups/${id}`)
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export async function listRows(): Promise<FinanceRow[]> {
    const res = await api.get<ApiResponse<FinanceRow[]>>('/finances/rows')
    return res.data.data
}

export async function createRow(
    group: string,
    name: string,
    recurringAmount?: number
): Promise<FinanceRow> {
    const res = await api.post<ApiResponse<FinanceRow>>('/finances/rows', { group, name, recurringAmount })
    return res.data.data
}

export async function updateRow(
    id: string,
    fields: Partial<Pick<FinanceRow, 'name' | 'order'> & { recurringAmount: number | null }>
): Promise<FinanceRow> {
    const res = await api.put<ApiResponse<FinanceRow>>(`/finances/rows/${id}`, fields)
    return res.data.data
}

export async function deleteRow(id: string): Promise<void> {
    await api.delete(`/finances/rows/${id}`)
}

// ── Entries ───────────────────────────────────────────────────────────────────

export async function listEntries(month: string): Promise<FinanceEntry[]> {
    const res = await api.get<ApiResponse<FinanceEntry[]>>('/finances/entries', { params: { month } })
    return res.data.data
}

export async function setEntry(
    rowId: string,
    month: string,
    amount: number | null
): Promise<FinanceEntry | null> {
    const res = await api.put<ApiResponse<FinanceEntry | null>>(
        `/finances/entries/${rowId}/${month}`,
        { amount }
    )
    return res.data.data
}
