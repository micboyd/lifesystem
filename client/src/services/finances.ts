import api from './api'
import type {
    ApiResponse,
    FinanceGroup,
    FinancePot,
    FinanceRow,
    FinanceEntry,
    BudgetSpend,
    BudgetExclusion,
    FinanceSubItem,
    StarlingSpace,
    StarlingMovement,
    StarlingExclusion,
} from '../types'
import type { DeleteMode } from '../lib/finance'

/** Add-scope for new groups/rows: visible from this month on, or this month only. */
export type AddScope = 'all' | 'month'

// ── Groups ────────────────────────────────────────────────────────────────────

export async function listGroups(): Promise<FinanceGroup[]> {
    const res = await api.get<ApiResponse<FinanceGroup[]>>('/finances/groups')
    return res.data.data
}

export async function createGroup(
    name: string,
    type: 'income' | 'expense' | 'savings',
    scope: AddScope = 'all',
    month?: string,
    extra?: { recurringAmount?: number }
): Promise<FinanceGroup> {
    // "all" = from the viewed month onward; "month" = that single month only.
    const lifecycle = month ? { startMonth: month, endMonth: scope === 'month' ? month : null } : {}
    const res = await api.post<ApiResponse<FinanceGroup>>('/finances/groups', {
        name,
        type,
        ...lifecycle,
        ...(extra ?? {}),
    })
    return res.data.data
}

export async function updateGroup(
    id: string,
    fields: Partial<
        Pick<FinanceGroup, 'name' | 'type' | 'order' | 'currentBalance' | 'annualInterestRate'>
    >
): Promise<FinanceGroup> {
    const res = await api.put<ApiResponse<FinanceGroup>>(`/finances/groups/${id}`, fields)
    return res.data.data
}

/**
 * Delete a group. `mode` controls scope: 'all' removes it everywhere (and its
 * rows/entries), 'onward' ends it before `month`, 'month' hides just `month`.
 * Soft modes return the updated group; 'all' returns null.
 */
export async function deleteGroup(
    id: string,
    mode: DeleteMode = 'all',
    month?: string
): Promise<FinanceGroup | null> {
    const res = await api.delete<ApiResponse<FinanceGroup | null>>(`/finances/groups/${id}`, {
        params: { mode, ...(month && { month }) },
    })
    return res.data.data ?? null
}

// ── Pots ──────────────────────────────────────────────────────────────────────

export async function listPots(groupId?: string): Promise<FinancePot[]> {
    const res = await api.get<ApiResponse<FinancePot[]>>('/finances/pots', {
        params: groupId ? { group: groupId } : undefined,
    })
    return res.data.data
}

export async function createPot(groupId: string, name: string): Promise<FinancePot> {
    const res = await api.post<ApiResponse<FinancePot>>('/finances/pots', { group: groupId, name })
    return res.data.data
}

export async function updatePot(id: string, name: string): Promise<FinancePot> {
    const res = await api.put<ApiResponse<FinancePot>>(`/finances/pots/${id}`, { name })
    return res.data.data
}

export async function deletePot(id: string): Promise<void> {
    await api.delete(`/finances/pots/${id}`)
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
    startMonth?: string,
    pot?: string
): Promise<FinanceRow> {
    const res = await api.post<ApiResponse<FinanceRow>>('/finances/rows', {
        group,
        name,
        recurringAmount,
        recurring,
        ...(month && { month }),
        ...(startMonth && { startMonth }),
        ...(pot && { pot }),
    })
    return res.data.data
}

export async function updateRow(
    id: string,
    fields: Partial<
        Pick<
            FinanceRow,
            'name' | 'order' | 'recurring' | 'budgeted' | 'budgetType' | 'starlingCategoryUid'
        > & {
            recurringAmount: number | null
        }
    >
): Promise<FinanceRow> {
    const res = await api.put<ApiResponse<FinanceRow>>(`/finances/rows/${id}`, fields)
    return res.data.data
}

/**
 * Delete a row. `mode` mirrors {@link deleteGroup}; soft modes only apply to
 * recurring rows (one-time rows live in a single month and are removed outright).
 * Soft modes return the updated row; 'all' returns null.
 */
export async function deleteRow(
    id: string,
    mode: DeleteMode = 'all',
    month?: string
): Promise<FinanceRow | null> {
    const res = await api.delete<ApiResponse<FinanceRow | null>>(`/finances/rows/${id}`, {
        params: { mode, ...(month && { month }) },
    })
    return res.data.data ?? null
}

// ── Entries ───────────────────────────────────────────────────────────────────

export async function listPaid(month: string): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/finances/paid', { params: { month } })
    return res.data.data
}

export async function setPaid(rowId: string, month: string, paid: boolean): Promise<void> {
    await api.put(`/finances/paid/${rowId}/${month}`, { paid })
}

export async function listEntries(month: string): Promise<FinanceEntry[]> {
    const res = await api.get<ApiResponse<FinanceEntry[]>>('/finances/entries', {
        params: { month },
    })
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

export async function listBudgetSpends(
    params: { month: string } | { date: string }
): Promise<BudgetSpend[]> {
    const res = await api.get<ApiResponse<BudgetSpend[]>>('/finances/budget-spends', { params })
    return res.data.data
}

/** Log a single transaction against a row on a date. */
export async function createBudgetSpend(
    rowId: string,
    date: string,
    amount: number,
    note?: string
): Promise<BudgetSpend> {
    const res = await api.post<ApiResponse<BudgetSpend>>('/finances/budget-spends', {
        row: rowId,
        date,
        amount,
        ...(note && { note }),
    })
    return res.data.data
}

/** Edit an existing transaction's amount and/or note. */
export async function updateBudgetSpend(
    id: string,
    fields: { amount?: number; note?: string | null }
): Promise<BudgetSpend> {
    const res = await api.put<ApiResponse<BudgetSpend>>(`/finances/budget-spends/${id}`, fields)
    return res.data.data
}

/** Remove a transaction. */
export async function deleteBudgetSpend(id: string): Promise<void> {
    await api.delete(`/finances/budget-spends/${id}`)
}

/**
 * Reassign a transaction to a different budget. If it was imported from Starling,
 * this also detaches it from that link server-side — the underlying transaction is
 * still attributed to the original Space in Starling's feed, so without detaching,
 * a future sync of the original budget would silently move it back.
 */
export async function moveBudgetSpend(id: string, rowId: string): Promise<BudgetSpend> {
    const res = await api.put<ApiResponse<BudgetSpend>>(`/finances/budget-spends/${id}/move`, {
        row: rowId,
    })
    return res.data.data
}

// ── Starling Bank ─────────────────────────────────────────────────────────────

/** List linkable Starling Spaces. Throws 501 if Starling isn't configured server-side. */
export async function listStarlingSpaces(): Promise<StarlingSpace[]> {
    const res = await api.get<ApiResponse<StarlingSpace[]>>('/finances/starling/spaces')
    return res.data.data
}

export interface StarlingSyncResult {
    imported: number
    updated: number
    removed: number
    /** Transactions Starling still shows, but you'd previously deleted or moved away
     *  — correctly left out rather than re-added. */
    skipped: number
    total: number
    /** The Space's current balance right after syncing, if it could be fetched. */
    balance: number | null
}

/** Pull the linked Space's transactions for a month into the budget's spends. */
export async function syncStarlingSpace(
    rowId: string,
    month: string
): Promise<StarlingSyncResult> {
    const res = await api.post<ApiResponse<StarlingSyncResult>>('/finances/starling/sync', {
        rowId,
        month,
    })
    return res.data.data
}

export interface StarlingReconciliation {
    balance: number | null
    movements: StarlingMovement[]
}

/**
 * Read-only explanation for a Space balance / budget-remaining mismatch: everything
 * in the month that moved the Space's money without counting as budget spend.
 */
export async function getStarlingReconciliation(
    rowId: string,
    month: string
): Promise<StarlingReconciliation> {
    const res = await api.get<ApiResponse<StarlingReconciliation>>('/finances/starling/reconcile', {
        params: { rowId, month },
    })
    return res.data.data
}

/** List transactions deleted or moved away from a Starling-linked budget. */
export async function listStarlingExclusions(): Promise<StarlingExclusion[]> {
    const res = await api.get<ApiResponse<StarlingExclusion[]>>('/finances/starling/exclusions')
    return res.data.data
}

/** Undo a delete or move: restores the transaction and lets it sync normally again. */
export async function recoverStarlingExclusion(id: string): Promise<BudgetSpend> {
    const res = await api.post<ApiResponse<BudgetSpend>>(
        `/finances/starling/exclusions/${id}/recover`
    )
    return res.data.data
}

// ── Budget day exclusions ─────────────────────────────────────────────────────

export async function listBudgetExclusions(month: string): Promise<BudgetExclusion[]> {
    const res = await api.get<ApiResponse<BudgetExclusion[]>>('/finances/budget-exclusions', {
        params: { month },
    })
    return res.data.data
}

export async function setBudgetExclusion(
    date: string,
    excluded: boolean
): Promise<BudgetExclusion | null> {
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

export async function createSubItem(
    rowId: string,
    name: string,
    amount: number,
    month?: string
): Promise<FinanceSubItem> {
    const res = await api.post<ApiResponse<FinanceSubItem>>('/finances/sub-items', {
        row: rowId,
        name,
        amount,
        ...(month && { month }),
    })
    return res.data.data
}

export async function updateSubItem(
    id: string,
    fields: Partial<Pick<FinanceSubItem, 'name' | 'amount' | 'order' | 'paid'>>
): Promise<FinanceSubItem> {
    const res = await api.put<ApiResponse<FinanceSubItem>>(`/finances/sub-items/${id}`, fields)
    return res.data.data
}

export async function deleteSubItem(id: string): Promise<void> {
    await api.delete(`/finances/sub-items/${id}`)
}
