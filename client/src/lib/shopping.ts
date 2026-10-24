import type { ShoppingGroup } from '../types'

/**
 * The shopping list you shop from: everything added, merged into one line
 * per name. A box (or a meal with ingredients) adds each ingredient's grams ×
 * batches (or servings) — or its items, for things bought by count; a food, a typed-in thing or a meal without
 * ingredients adds itself, counted. Mirrors the server's line names.
 */

export interface ShoppingLine {
    /** Lower-cased name — what ticks are kept by. */
    key: string
    name: string
    grams: number
    qty: number
    /** The boxes and meals it's for. */
    from: string[]
    /** The typed-in entry behind it, if any — removable from the line. */
    item?: ShoppingGroup
}

export const lineKey = (name: string) => name.trim().toLowerCase()

export function mergeLines(groups: ShoppingGroup[]): ShoppingLine[] {
    const lines = new Map<string, ShoppingLine>()
    const line = (name: string) => {
        const key = lineKey(name)
        let l = lines.get(key)
        if (!l) {
            l = { key, name: name.trim(), grams: 0, qty: 0, from: [] }
            lines.set(key, l)
        }
        return l
    }
    for (const g of groups) {
        if ((g.kind === 'box' || g.kind === 'meal') && g.ingredients.length > 0) {
            for (const i of g.ingredients) {
                const l = line(i.name)
                if (i.items) l.qty += i.items * g.count
                else l.grams += i.grams * g.count
                if (!l.from.includes(g.name)) l.from.push(g.name)
            }
        } else {
            const l = line(g.name)
            l.qty += g.count
            if (g.kind === 'item') l.item = g
        }
    }
    return [...lines.values()]
}

/** An ingredient's amount in a recipe: "400 g", "×5", or "×5 · 400 g". */
export function ingredientAmount(i: { grams: number; items?: number }): string {
    const grams = i.grams > 0 ? `${Math.round(i.grams * 10) / 10} g` : ''
    return [i.items ? `×${i.items}` : '', grams].filter(Boolean).join(' · ')
}

/** "1.2 kg · ×2", "500 g", "×3" — nothing for a single thing. */
export function lineAmount(l: ShoppingLine): string {
    const weight =
        l.grams <= 0
            ? ''
            : l.grams >= 1000
              ? `${Math.round(l.grams / 100) / 10} kg`
              : `${Math.round(l.grams)} g`
    const qty = l.qty > 1 || (l.qty > 0 && l.grams > 0) ? `×${l.qty}` : ''
    return [weight, qty].filter(Boolean).join(' · ')
}
