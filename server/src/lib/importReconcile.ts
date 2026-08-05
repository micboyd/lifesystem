import { Types } from 'mongoose'

/** Normalise a name for case-insensitive duplicate matching. */
export function nameKey(name: string): string {
    return name.trim().toLowerCase()
}

/**
 * The client sends an `overwrite` map when the user chose to replace existing
 * items on a name clash: `{ "<lowercased name>": "<existing id>" }`. Overwritten
 * items are updated in place (same id), so anything that references them — the
 * weekly planner especially — reflects the new content automatically.
 */
export function parseOverwriteMap(raw: unknown): Map<string, string> {
    const map = new Map<string, string>()
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof v === 'string' && Types.ObjectId.isValid(v)) map.set(k.trim().toLowerCase(), v)
        }
    }
    return map
}

/**
 * Pull the list of items to import out of a request body. Accepts a bare array,
 * `{ items: [...] }` (what the client sends), or a legacy `{ <key>: [...] }`.
 */
export function extractList(body: unknown, legacyKey: string): unknown[] | null {
    if (Array.isArray(body)) return body
    if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>
        if (Array.isArray(obj.items)) return obj.items
        if (Array.isArray(obj[legacyKey])) return obj[legacyKey] as unknown[]
    }
    return null
}

/** The overwrite map lives on `body.overwrite`. */
export function extractOverwrite(body: unknown): Map<string, string> {
    const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).overwrite : undefined
    return parseOverwriteMap(raw)
}
