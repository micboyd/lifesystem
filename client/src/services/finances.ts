import api from './api'
import type { ApiResponse, FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend, BudgetExclusion, FinanceSubItem } from '../types'

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
    fields: Partial<Pick<FinanceGroup, 'name' | 'type' | 'order' | 'currentBalance' | 'annualInterestRate'>>
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
    recurringAmount?: number,
    recurring?: boolean,
    month?: string,
): Promise<FinanceRow> {
    const res = await api.post<ApiResponse<FinanceRow>>('/finances/rows', { group, name, recurringAmount, recurring, ...(month && { month }) })
    return res.data.data
}

export async function updateRow(
    id: string,
    fields: Partial<Pick<FinanceRow, 'name' | 'order' | 'recurring' | 'budgeted' | 'budgetType'> & { recurringAmount: number | null }>
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

// ── Budget daily spends ───────────────────────────────────────────────────────

export async function listBudgetSpends(params: { month: string } | { date: string }): Promise<BudgetSpend[]> {
    const res = await api.get<ApiResponse<BudgetSpend[]>>('/finances/budget-spends', { params })
    return res.data.data
}

export async function setBudgetSpend(
    rowId: string,
    date: string,
    amount: number | null
): Promise<BudgetSpend | null> {
    const res = await api.put<ApiResponse<BudgetSpend | null>>(
        `/finances/budget-spends/${rowId}/${date}`,
        { amount }
    )
    return res.data.data
}

// ── Budget day exclusions ─────────────────────────────────────────────────────

export async function listBudgetExclusions(month: string): Promise<BudgetExclusion[]> {
    const res = await api.get<ApiResponse<BudgetExclusion[]>>('/finances/budget-exclusions', { params: { month } })
    return res.data.data
}

export async function setBudgetExclusion(date: string, excluded: boolean): Promise<BudgetExclusion | null> {
    const res = await api.put<ApiResponse<BudgetExclusion | null>>(
        `/finances/budget-exclusions/${date}`,
        { excluded }
    )
    return res.data.data
}

// ── Row breakdown sub-items ───────────────────────────────────────────────────

export async function listSubItems(rowId: string, month?: string): Promise<FinanceSubItem[]> {
    const params: Record<string, string> = { row: rowId }
    if (month) params.month = month
    const res = await api.get<ApiResponse<FinanceSubItem[]>>('/finances/sub-items', { params })
    return res.data.data
}

export async function createSubItem(rowId: string, name: string, amount: number, month?: string): Promise<FinanceSubItem> {
    const res = await api.post<ApiResponse<FinanceSubItem>>('/finances/sub-items', { row: rowId, name, amount, ...(month && { month }) })
    return res.data.data
}

export async function updateSubItem(id: string, fields: Partial<Pick<FinanceSubItem, 'name' | 'amount' | 'order'>>): Promise<FinanceSubItem> {
    const res = await api.put<ApiResponse<FinanceSubItem>>(`/finances/sub-items/${id}`, fields)
    return res.data.data
}

export async function deleteSubItem(id: string): Promise<void> {
    await api.delete(`/finances/sub-items/${id}`)
}
