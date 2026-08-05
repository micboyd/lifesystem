import api from './api'
import type { ApiResponse } from '../types'

/** The fitness libraries that support append-only JSON import + undo. */
export type ImportResource = 'conditioning' | 'exercises' | 'workouts' | 'mobility' | 'recovery'

/** Chosen name-clash overwrites: `{ "<lowercased name>": "<existing id>" }`. */
export type OverwriteMap = Record<string, string>

/** What an import did: how many records were newly created vs overwritten. */
export interface ImportResult {
    created: number
    updated: number
}

/**
 * Build the POST body for an import. When the user chose to overwrite name
 * clashes, `items` must be the bare array so the server can match by name.
 */
export function importBody(data: unknown, overwrite?: OverwriteMap): unknown {
    return overwrite && Object.keys(overwrite).length > 0 ? { items: data, overwrite } : data
}

/** Read the created/updated counts out of an import response. */
export function importResult(data: { length: number }, body: { updated?: number }): ImportResult {
    return { created: data.length, updated: body.updated ?? 0 }
}

/** Summary of the most recent import batch for a library. */
export interface LastImport {
    batch: string
    count: number
    /** ISO timestamp of when the batch was imported. */
    importedAt: string
}

/** Fetch the most recent import batch for a library, or null if there is none. */
export async function getLastImport(resource: ImportResource): Promise<LastImport | null> {
    const res = await api.get<ApiResponse<LastImport | null>>(`/${resource}/import/last`)
    return res.data.data
}

/** Revert the most recent import batch. Returns what was removed. */
export async function undoLastImport(resource: ImportResource): Promise<LastImport | null> {
    const res = await api.delete<ApiResponse<LastImport | null>>(`/${resource}/import/last`)
    return res.data.data
}
