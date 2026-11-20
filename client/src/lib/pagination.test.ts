import { describe, expect, it } from 'vitest'
import { buildPageItems, clampPage, type PageItem } from './pagination'

/** Compact form: numbers for pages, '…' for gaps. */
const show = (items: PageItem[]) => items.map((it) => (it.kind === 'page' ? it.page : '…'))

describe('buildPageItems', () => {
    it('shows every page when they all fit', () => {
        expect(show(buildPageItems(1, 1))).toEqual([1])
        expect(show(buildPageItems(3, 7))).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('keeps the same number of slots on every page', () => {
        for (const s of [0, 1, 2]) {
            for (let p = 1; p <= 30; p++) {
                expect(buildPageItems(p, 30, s)).toHaveLength(s * 2 + 5)
            }
        }
    })

    it('pins the window to the start and end', () => {
        expect(show(buildPageItems(1, 20))).toEqual([1, 2, 3, 4, 5, '…', 20])
        expect(show(buildPageItems(4, 20))).toEqual([1, 2, 3, 4, 5, '…', 20])
        expect(show(buildPageItems(17, 20))).toEqual([1, '…', 16, 17, 18, 19, 20])
        expect(show(buildPageItems(20, 20))).toEqual([1, '…', 16, 17, 18, 19, 20])
    })

    it('centres on the current page in the middle', () => {
        expect(show(buildPageItems(5, 20))).toEqual([1, '…', 4, 5, 6, '…', 20])
        expect(show(buildPageItems(10, 20, 2))).toEqual([1, '…', 8, 9, 10, 11, 12, '…', 20])
        expect(show(buildPageItems(5, 20, 0))).toEqual([1, '…', 5, '…', 20])
    })

    it('never uses a gap to hide a single page', () => {
        for (const s of [0, 1, 2]) {
            for (const n of [8, 9, 10, 15]) {
                for (let p = 1; p <= n; p++) {
                    const items = show(buildPageItems(p, n, s))
                    items.forEach((it, i) => {
                        if (it !== '…') return
                        const gapSize = (items[i + 1] as number) - (items[i - 1] as number) - 1
                        expect(gapSize).toBeGreaterThanOrEqual(2)
                    })
                }
            }
        }
    })

    it('gaps jump a window of pages, clamped to the ends', () => {
        const items = buildPageItems(10, 30)
        const gaps = items.filter((it) => it.kind === 'gap')
        expect(gaps).toEqual([
            { kind: 'gap', side: 'left', target: 5 },
            { kind: 'gap', side: 'right', target: 15 },
        ])
        expect(buildPageItems(28, 30).find((it) => it.kind === 'gap')).toMatchObject({ target: 23 })
        expect(buildPageItems(3, 6 + 2, 1).find((it) => it.kind === 'gap')).toMatchObject({ target: 8 })
    })

    it('copes with an out-of-range current page', () => {
        expect(show(buildPageItems(99, 20))).toEqual([1, '…', 16, 17, 18, 19, 20])
        expect(show(buildPageItems(0, 20))).toEqual([1, 2, 3, 4, 5, '…', 20])
    })
})

describe('clampPage', () => {
    it('keeps the page inside 1..pageCount', () => {
        expect(clampPage(0, 5)).toBe(1)
        expect(clampPage(9, 5)).toBe(5)
        expect(clampPage(3, 0)).toBe(1)
        expect(clampPage(NaN, 5)).toBe(1)
    })
})
