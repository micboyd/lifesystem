import api from './api'
import type { ApiResponse, Checklist, ChecklistColor } from '../types'

export interface ChecklistInput {
    title: string
    description?: string | null
    color?: ChecklistColor
}

// ── Checklists ────────────────────────────────────────────────────────────────

export async function listChecklists(): Promise<Checklist[]> {
    const res = await api.get<ApiResponse<Checklist[]>>('/checklists')
    return res.data.data
}

export async function createChecklist(input: ChecklistInput): Promise<Checklist> {
    const res = await api.post<ApiResponse<Checklist>>('/checklists', input)
    return res.data.data
}

export async function updateChecklist(
    id: string,
    input: Partial<ChecklistInput>
): Promise<Checklist> {
    const res = await api.put<ApiResponse<Checklist>>(`/checklists/${id}`, input)
    return res.data.data
}

export async function deleteChecklist(id: string): Promise<void> {
    await api.delete(`/checklists/${id}`)
}

/** Uncheck every item across every group. Returns the updated checklist. */
export async function resetChecklist(id: string): Promise<Checklist> {
    const res = await api.post<ApiResponse<Checklist>>(`/checklists/${id}/reset`, {})
    return res.data.data
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function addGroup(checklistId: string, name = ''): Promise<Checklist> {
    const res = await api.post<ApiResponse<Checklist>>(`/checklists/${checklistId}/groups`, { name })
    return res.data.data
}

export async function updateGroup(
    checklistId: string,
    groupId: string,
    input: { name?: string; order?: number }
): Promise<Checklist> {
    const res = await api.put<ApiResponse<Checklist>>(
        `/checklists/${checklistId}/groups/${groupId}`,
        input
    )
    return res.data.data
}

export async function deleteGroup(checklistId: string, groupId: string): Promise<Checklist> {
    const res = await api.delete<ApiResponse<Checklist>>(
        `/checklists/${checklistId}/groups/${groupId}`
    )
    return res.data.data
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function addItem(
    checklistId: string,
    groupId: string,
    text: string
): Promise<Checklist> {
    const res = await api.post<ApiResponse<Checklist>>(
        `/checklists/${checklistId}/groups/${groupId}/items`,
        { text }
    )
    return res.data.data
}

export async function updateItem(
    checklistId: string,
    groupId: string,
    itemId: string,
    input: { text?: string; done?: boolean; order?: number }
): Promise<Checklist> {
    const res = await api.put<ApiResponse<Checklist>>(
        `/checklists/${checklistId}/groups/${groupId}/items/${itemId}`,
        input
    )
    return res.data.data
}

export async function deleteItem(
    checklistId: string,
    groupId: string,
    itemId: string
): Promise<Checklist> {
    const res = await api.delete<ApiResponse<Checklist>>(
        `/checklists/${checklistId}/groups/${groupId}/items/${itemId}`
    )
    return res.data.data
}
