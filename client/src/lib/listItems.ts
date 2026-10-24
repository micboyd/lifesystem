import type { ListItem, ListKind } from '../types'

/** A fresh client-side item id. */
export function newItemId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function blankItem(text = ''): ListItem {
    return { id: newItemId(), text, done: false }
}

/** Inserts `item` straight after the item with `afterId` (or at the end). */
export function insertAfter(items: ListItem[], afterId: string | null, item: ListItem): ListItem[] {
    const i = afterId ? items.findIndex((x) => x.id === afterId) : -1
    if (i < 0) return [...items, item]
    return [...items.slice(0, i + 1), item, ...items.slice(i + 1)]
}

/** Moves an item one place up (-1) or down (+1), clamped at the ends. */
export function moveItem(items: ListItem[], id: string, delta: -1 | 1): ListItem[] {
    const i = items.findIndex((x) => x.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= items.length) return items
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
}

/**
 * Pasted text → one line per item, with common list markers stripped
 * ("- ", "* ", "• ", "1. ", "[ ] ", "[x] "). A "[x]" line comes in ticked.
 */
export function linesToItems(text: string): ListItem[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const done = /^(?:[-*•]\s*)?\[[xX]\]\s*/.test(line)
            const clean = line
                .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
                .replace(/^\[[ xX]?\]\s*/, '')
                .trim()
            return { id: newItemId(), text: clean, done }
        })
        .filter((i) => i.text.length > 0)
}

/** "3 of 7 done" for a checklist, "7 items" otherwise. */
export function listSummary(kind: ListKind, items: ListItem[]): string {
    const filled = items.filter((i) => i.text.trim())
    if (filled.length === 0) return 'Empty'
    if (kind === 'checklist')
        return `${filled.filter((i) => i.done).length} of ${filled.length} done`
    return `${filled.length} item${filled.length === 1 ? '' : 's'}`
}

export const LIST_KIND_META: Record<ListKind, { label: string; icon: string; hint: string }> = {
    checklist: {
        label: 'Checklist',
        icon: 'fa-solid fa-list-check',
        hint: 'Tick things off as you go',
    },
    bullets: { label: 'Bullets', icon: 'fa-solid fa-list-ul', hint: 'A plain list of points' },
    numbered: {
        label: 'Numbered',
        icon: 'fa-solid fa-list-ol',
        hint: 'Steps or a ranking, in order',
    },
}
