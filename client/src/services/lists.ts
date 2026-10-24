import api from './api'
import type { ApiResponse, List, ListItem, ListKind } from '../types'

export interface ListInput {
    title?: string
    kind?: ListKind
    pinned?: boolean
    items?: ListItem[]
}

export async function listLists(): Promise<List[]> {
    const res = await api.get<ApiResponse<List[]>>('/lists')
    return res.data.data
}

export async function createList(title: string, kind: ListKind): Promise<List> {
    const res = await api.post<ApiResponse<List>>('/lists', { title, kind })
    return res.data.data
}

export async function updateList(id: string, input: ListInput): Promise<List> {
    const res = await api.put<ApiResponse<List>>(`/lists/${id}`, input)
    return res.data.data
}

export async function deleteList(id: string): Promise<void> {
    await api.delete(`/lists/${id}`)
}
