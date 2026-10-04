/**
 * A conditioning session's "helpers" — the setup you'd otherwise have to work
 * out on the day, e.g. "Cones at 0, 5 and 10 m for the shuttle". One free-text
 * line each, read from an array or a newline-separated string, under `helpers`
 * or `setup`.
 */

const MAX_ITEMS = 12
const MAX_LENGTH = 200

/** Normalise to trimmed, non-empty lines. */
export function toHelpers(raw: unknown): string[] {
    const lines = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string')
        : typeof raw === 'string'
          ? raw.split('\n')
          : []
    return lines
        .map((l) => l.trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH))
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
}

/** The helpers on an imported session, under any of the names they're read as. */
export function readHelpers(o: Record<string, unknown>): string[] {
    return toHelpers(o.helpers ?? o.setup)
}
