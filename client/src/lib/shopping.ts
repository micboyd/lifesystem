import type { ShoppingGroup } from '../types'
import { isSide } from './mealAim'

/**
 * The shopping list you shop from: everything added, merged into one line
 * per name. A box (or a meal with ingredients) adds each ingredient's grams ×
 * batches (or servings) — or its items, for things bought by count; a food, a typed-in thing or a meal without
 * ingredients adds itself, counted. Mirrors the server's line names.
 *
 * A tray meal's ingredients are the whole tray's and its count is in boxes.
 * Shopping by servings buys exactly that many boxes' worth; shopping by batch
 * buys whole trays — enough of them to cover the boxes.
 */

export type ShopMode = 'servings' | 'batch'

/** A tray meal on the list: how many boxes one tray makes. */
export const trayOf = (g: ShoppingGroup): number | null =>
    g.kind === 'meal' && (g.batchOf ?? 0) > 1 ? g.batchOf! : null

/** Whole trays to cook for `boxes`. */
export const traysFor = (boxes: number, batchOf: number) => Math.max(1, Math.ceil(boxes / batchOf))

/** How many times over a group's ingredients are bought. */
function times(g: ShoppingGroup, mode: ShopMode): number {
    const tray = trayOf(g)
    if (!tray) return g.count
    return mode === 'batch' ? traysFor(g.count, tray) : g.count / tray
}

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

/** One word, singular: berries → berry, tomatoes → tomato, peaches → peach, eggs → egg. Leaves hummus, couscous, grass alone. */
function singular(word: string): string {
    if (word.length <= 3) return word
    if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
    if (/(o|ch|sh|x)es$/.test(word)) return word.slice(0, -2)
    if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1)
    return word
}

/**
 * What a line is merged and ticked by: lower case, spaces tidied, the last
 * word made singular — so "Onions", "onion" and "red  onions " land on the
 * right lines and a name typed two ways still makes one line.
 */
export function lineKey(name: string): string {
    const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    words[words.length - 1] = singular(words[words.length - 1])
    return words.join(' ')
}

export function mergeLines(groups: ShoppingGroup[], mode: ShopMode = 'batch'): ShoppingLine[] {
    const lines = new Map<string, ShoppingLine>()
    const line = (name: string) => {
        const key = lineKey(name)
        let l = lines.get(key)
        if (!l) {
            l = { key, name: name.trim().replace(/\s+/g, ' '), grams: 0, qty: 0, from: [] }
            lines.set(key, l)
        }
        return l
    }
    for (const g of groups) {
        if ((g.kind === 'box' || g.kind === 'meal') && g.ingredients.length > 0) {
            const n = times(g, mode)
            for (const i of g.ingredients) {
                const l = line(i.name)
                // Counted things come in whole ones, even for a share of a tray.
                if (i.items) l.qty += Math.ceil(i.items * n - 1e-9)
                else l.grams += i.grams * n
                if (!l.from.includes(g.name)) l.from.push(g.name)
            }
        } else if (g.name.trim()) {
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

/** The ticked names as line keys — older ticks were saved before names were made singular. */
export const tickedKeys = (ticked: string[]) => new Set(ticked.map(lineKey))

/** How many times over a group's ingredients are bought — trays whole. */
export const timesBought = (g: ShoppingGroup) => times(g, 'batch')

/**
 * Whether an ingredient is a side (cooked in its own pot, weighed out apart),
 * by what's been marked on the shopping list — else a guess from its name.
 */
export function sideMarked(name: string, marks: Record<string, boolean>): boolean {
    return marks[lineKey(name)] ?? isSide(name)
}
