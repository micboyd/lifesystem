/**
 * A workout's "what to bring" list — the kit you pack from home: a lifting
 * belt, a neck harness, a resistance band. Read from an array of names or one
 * comma-separated string, under `bring` or the names a hand-written plan might
 * use (`whatToBring`, `kit`, `homeEquipment`).
 */

/** Most a workout will list — beyond this it's a packing list, not a reminder. */
const MAX_ITEMS = 20

/** Normalise to trimmed, de-duplicated (case-insensitively) item names. */
export function toBringList(raw: unknown): string[] {
    const parts = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string')
        : typeof raw === 'string'
          ? raw.split(',')
          : []
    const out: string[] = []
    const seen = new Set<string>()
    for (const p of parts) {
        const t = p.trim().replace(/\s+/g, ' ')
        const key = t.toLowerCase()
        if (!t || seen.has(key)) continue
        seen.add(key)
        out.push(t.slice(0, 60))
        if (out.length >= MAX_ITEMS) break
    }
    return out
}

/** The list on an imported workout, under any of the names it's read as. */
export function readBringList(o: Record<string, unknown>): string[] {
    return toBringList(o.bring ?? o.whatToBring ?? o.kit ?? o.homeEquipment)
}
