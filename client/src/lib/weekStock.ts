import type { MealPlanEntry, PlateFood } from '../types'
import { gramsLeft } from './plates'

/**
 * Whether the pantry covers what's planned: for each box (or plain food kept
 * in batches), the grams on plates still to eat plus box notes at their
 * projected grams, against what's left in open batches and in the freezer.
 * Plain foods with no batches at all (a packet of rice) aren't tracked — the
 * pantry knows nothing about them.
 */

export type StockStatus =
    /** Open batches cover it. */
    | 'ok'
    /** Only with something out of the freezer. */
    | 'thaw'
    /** Not enough even with the freezer. */
    | 'short'

export interface StockRow {
    food: string
    name: string
    /** Grams planned. Box notes count at their projection. */
    needed: number
    /** Box notes with no projection (no targets, or never cooked) — "some", amount unknown. */
    unsized: number
    /** Grams left in open batches. */
    open: number
    /** Grams in the freezer. */
    frozen: number
    status: StockStatus
    /** Grams missing, when short. */
    short: number
}

export function weekStock(
    entries: MealPlanEntry[],
    foods: PlateFood[],
    projectedGrams: (entryId: string) => number | null,
    from: string
): StockRow[] {
    const need = new Map<string, { grams: number; unsized: number }>()
    const add = (food: string, grams: number | null) => {
        const n = need.get(food) ?? { grams: 0, unsized: 0 }
        if (grams == null) n.unsized++
        else n.grams += grams
        need.set(food, n)
    }
    for (const e of entries) {
        if (e.status !== 'planned' || e.date < from) continue
        if (e.box) add(e.box, projectedGrams(e._id))
        for (const l of e.plate ?? []) if (l.grams > 0) add(l.food, l.grams)
    }

    const rows: StockRow[] = []
    for (const [id, n] of need) {
        const f = foods.find((x) => x._id === id)
        if (!f) continue
        const open = f.open.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)
        const frozen = f.frozen.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)
        if (f.kind === 'plain' && !f.last && open + frozen === 0) continue
        // A note with no size needs at least something there.
        const wanted = Math.max(n.grams, n.unsized > 0 ? 1 : 0)
        const status: StockStatus =
            wanted <= open ? 'ok' : wanted <= open + frozen ? 'thaw' : 'short'
        rows.push({
            food: id,
            name: f.name,
            needed: Math.round(n.grams),
            unsized: n.unsized,
            open,
            frozen,
            status,
            short: status === 'short' ? Math.max(0, Math.round(n.grams - open - frozen)) : 0,
        })
    }
    const rank: Record<StockStatus, number> = { short: 0, thaw: 1, ok: 2 }
    return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
}
