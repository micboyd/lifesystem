export type PageItem =
    | { kind: 'page'; page: number }
    /** A run of hidden pages; clicking it jumps to `target`. */
    | { kind: 'gap'; target: number; side: 'left' | 'right' }

/**
 * Page buttons to show, always the same number of slots (siblingCount * 2 + 5)
 * once there are more pages than that, so the bar never changes width as you
 * page through. First and last are always shown; a gap never hides just one
 * page (that page is shown instead).
 */
export function buildPageItems(page: number, pageCount: number, siblingCount = 1): PageItem[] {
    const count = Math.max(1, Math.floor(pageCount))
    const s = Math.max(0, Math.floor(siblingCount))
    const current = clampPage(page, count)
    const slots = s * 2 + 5
    const range = (from: number, to: number): PageItem[] =>
        Array.from({ length: to - from + 1 }, (_, i) => ({ kind: 'page', page: from + i }))

    if (count <= slots) return range(1, count)

    // How far a gap jumps: one window's worth of pages.
    const jump = s * 2 + 3
    const edge = s + 3 // within this many pages of an end, pin the window to it

    if (current <= edge) {
        return [
            ...range(1, slots - 2),
            { kind: 'gap', side: 'right', target: Math.min(count, current + jump) },
            { kind: 'page', page: count },
        ]
    }
    if (current >= count - edge + 1) {
        return [
            { kind: 'page', page: 1 },
            { kind: 'gap', side: 'left', target: Math.max(1, current - jump) },
            ...range(count - slots + 3, count),
        ]
    }
    return [
        { kind: 'page', page: 1 },
        { kind: 'gap', side: 'left', target: Math.max(1, current - jump) },
        ...range(current - s, current + s),
        { kind: 'gap', side: 'right', target: Math.min(count, current + jump) },
        { kind: 'page', page: count },
    ]
}

export function clampPage(page: number, pageCount: number): number {
    const count = Math.max(1, Math.floor(pageCount))
    if (!Number.isFinite(page)) return 1
    return Math.min(Math.max(Math.round(page), 1), count)
}
