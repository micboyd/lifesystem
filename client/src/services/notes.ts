import api from './api'
import type { ApiResponse, Note, NoteCategory } from '../types'

export interface NoteInput {
    title: string
    body?: string
    /** Category id, or null/'' for uncategorised. */
    category?: string | null
}

export interface NoteCategoryInput {
    name: string
    color?: NoteCategory['color']
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function listNoteCategories(): Promise<NoteCategory[]> {
    const res = await api.get<ApiResponse<NoteCategory[]>>('/notes/categories')
    return res.data.data
}

export async function createNoteCategory(input: NoteCategoryInput): Promise<NoteCategory> {
    const res = await api.post<ApiResponse<NoteCategory>>('/notes/categories', input)
    return res.data.data
}

export async function updateNoteCategory(
    id: string,
    input: Partial<NoteCategoryInput>
): Promise<NoteCategory> {
    const res = await api.put<ApiResponse<NoteCategory>>(`/notes/categories/${id}`, input)
    return res.data.data
}

export async function deleteNoteCategory(id: string): Promise<void> {
    await api.delete(`/notes/categories/${id}`)
}

// ── Notes ───────────────────────────────────────────────────────────────────

export async function listNotes(): Promise<Note[]> {
    const res = await api.get<ApiResponse<Note[]>>('/notes')
    return res.data.data
}

export async function createNote(input: NoteInput): Promise<Note> {
    const res = await api.post<ApiResponse<Note>>('/notes', input)
    return res.data.data
}

export async function updateNote(id: string, input: Partial<NoteInput>): Promise<Note> {
    const res = await api.put<ApiResponse<Note>>(`/notes/${id}`, input)
    return res.data.data
}

export async function deleteNote(id: string): Promise<void> {
    await api.delete(`/notes/${id}`)
}
