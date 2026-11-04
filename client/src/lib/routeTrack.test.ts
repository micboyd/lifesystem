import { describe, expect, it } from 'vitest'
import { placeArrows, type Px } from './routeTrack'

// 1 px = 1 m keeps the metre side easy to read.
const cumOf = (pts: Px[]) => {
    const out = [0]
    for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    return out
}
const line = (from: Px, to: Px, steps: number): Px[] =>
    Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }))

describe('placeArrows', () => {
    it('points along a straight line, on the line', () => {
        const pts = line({ x: 0, y: 0 }, { x: 500, y: 0 }, 50)
        const arrows = placeArrows(pts, cumOf(pts))
        expect(arrows.length).toBeGreaterThan(3)
        for (const a of arrows) {
            expect(a.angle).toBeCloseTo(0)
            expect(a.beside).toBe(false)
            expect(a.y).toBeCloseTo(0)
        }
        // Spaced out in order from the start.
        expect(arrows.map((a) => a.atM)).toEqual([...arrows.map((a) => a.atM)].sort((x, y) => x - y))
    })

    it('follows a clockwise loop round each side', () => {
        // On screen (y down): right along the top, down the right, left along the bottom, up the left.
        const pts = [
            ...line({ x: 0, y: 0 }, { x: 400, y: 0 }, 40),
            ...line({ x: 400, y: 0 }, { x: 400, y: 400 }, 40).slice(1),
            ...line({ x: 400, y: 400 }, { x: 0, y: 400 }, 40).slice(1),
            ...line({ x: 0, y: 400 }, { x: 0, y: 0 }, 40).slice(1),
        ]
        const arrows = placeArrows(pts, cumOf(pts), { clearPx: 0 })
        const side = (a: { x: number; y: number }) =>
            a.y < 1 ? 'top' : a.x > 399 ? 'right' : a.y > 399 ? 'bottom' : a.x < 1 ? 'left' : 'corner'
        const want: Record<string, number> = { top: 0, right: 90, bottom: 180, left: -90 }
        let checked = 0
        for (const a of arrows) {
            const s = side(a)
            if (s === 'corner') continue
            expect(Math.abs(((a.angle - want[s] + 540) % 360) - 180)).toBeLessThan(1)
            expect(a.beside).toBe(false)
            checked++
        }
        expect(checked).toBeGreaterThan(10)
    })

    it('splits an out-and-back into two sides, each pointing its own way', () => {
        const out = line({ x: 0, y: 0 }, { x: 600, y: 0 }, 60)
        const back = line({ x: 600, y: 0 }, { x: 0, y: 0 }, 60).slice(1)
        const pts = [...out, ...back]
        const arrows = placeArrows(pts, cumOf(pts))
        const outbound = arrows.filter((a) => a.atM < 600)
        const inbound = arrows.filter((a) => a.atM > 600)
        expect(outbound.length).toBeGreaterThan(2)
        expect(inbound.length).toBeGreaterThan(2)
        for (const a of outbound) {
            expect(a.angle).toBeCloseTo(0)
            if (a.atM < 560) {
                expect(a.beside).toBe(true)
                expect(a.y).toBeGreaterThan(0) // right of eastward travel is down the screen
            }
        }
        for (const a of inbound) {
            expect(Math.abs(a.angle)).toBeCloseTo(180)
            if (a.atM > 640) {
                expect(a.beside).toBe(true)
                expect(a.y).toBeLessThan(0)
            }
        }
    })

    it('leaves room around markers and the ends', () => {
        const pts = line({ x: 0, y: 0 }, { x: 500, y: 0 }, 50)
        const all = placeArrows(pts, cumOf(pts))
        const kept = placeArrows(pts, cumOf(pts), { clearOfM: [all[1].atM] })
        expect(kept.length).toBe(all.length - 1)
        for (const a of all) {
            expect(a.atM).toBeGreaterThanOrEqual(28)
            expect(a.atM).toBeLessThanOrEqual(472)
        }
    })

    it('puts one arrow mid-way on a short line, none on a dot', () => {
        const pts = line({ x: 0, y: 0 }, { x: 40, y: 0 }, 4)
        expect(placeArrows(pts, cumOf(pts))).toHaveLength(1)
        expect(placeArrows([{ x: 0, y: 0 }], [0])).toEqual([])
    })
})
