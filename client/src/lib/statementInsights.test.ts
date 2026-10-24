import { describe, it, expect } from 'vitest'
import { buildMonthStatement } from './monthStatement'
import { buildInsights, kindTotals, spendKind, totalSaving, type Copy } from './statementInsights'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, extra: Partial<StarlingSpendItem> = {}): StarlingSpendItem {
    n++
    return {
        id: `t${n}`,
        date,
        time: `${date}T12:${String(n % 60).padStart(2, '0')}:00Z`,
        amount,
        merchant: 'Tesco',
        category: 'GROCERIES',
        space: 'Main account',
        ...extra,
    }
}

const d = (day: number, month = '2026-10') => `${month}-${String(day).padStart(2, '0')}`
const plain = (c: Copy) => c.map((p) => (typeof p === 'string' ? p : `£${p.money}`)).join('')

// A normal-sized month (about £2,000), so "material" is about £60.
const baseline = (month: string) => [
    tx(d(1, month), 1200, { merchant: 'Landlord', category: 'PAYMENTS' }),
    tx(d(3, month), 400, { merchant: 'Tesco', category: 'GROCERIES' }),
    tx(d(5, month), 45, { merchant: 'EE', category: 'BILLS_AND_SERVICES' }),
    tx(d(6, month), 9.99, { merchant: 'Netflix', category: 'ENTERTAINMENT' }),
    tx(d(7, month), 30, { merchant: 'Octopus', category: 'BILLS_AND_SERVICES' }),
]

function run(cur: StarlingSpendItem[], prev: StarlingSpendItem[], older?: StarlingSpendItem[]) {
    const s = buildMonthStatement('2026-10', cur, prev, '2026-10-20')
    return buildInsights(s, prev, 'September', older ? { name: 'August', month: '2026-08', items: older } : undefined)
}

describe('spendKind', () => {
    it('sorts Starling categories into needs, treats and other', () => {
        expect(spendKind('GROCERIES')).toBe('essential')
        expect(spendKind('EATING_OUT')).toBe('lifestyle')
        expect(spendKind('PAYMENTS')).toBe('other')
        expect(spendKind(null)).toBe('other')
    })
})

describe('buildInsights: what makes the cut', () => {
    it('ignores small habits that are a choice, not a problem', () => {
        // Five trips to the rugby club bar at ~£4.50: about £30 a month.
        const rugby = [2, 6, 9, 13, 16].map((day) =>
            tx(d(day), 4.47, { merchant: 'Portobello Rug', category: 'EATING_OUT' })
        )
        const insights = run([...baseline('2026-10'), ...rugby], baseline('2026-09'))
        expect(insights.find((i) => i.id.startsWith('habit'))).toBeUndefined()
        expect(insights.find((i) => i.id === 'up-EATING_OUT')).toBeUndefined()
    })

    it('raises a habit once it runs to real money', () => {
        const pret = [1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16].map((day) =>
            tx(d(day), 9.5, { merchant: 'Pret', category: 'EATING_OUT' })
        )
        const habit = run([...baseline('2026-10'), ...pret], [...baseline('2026-09'), ...pret.map((t) => ({ ...t, id: t.id + 'p', date: t.date.replace('-10-', '-09-'), time: t.time.replace('-10-', '-09-') }))])
            .find((i) => i.id === 'habit-pret')!
        expect(plain(habit.title)).toMatch(/^12 payments to Pret run to £/)
    })
})

describe('buildInsights: price rises', () => {
    it("doesn't call a dearer dinner a price rise", () => {
        const dinner = (month: string, amount: number) => tx(d(10, month), amount, { merchant: 'Dishoom', category: 'EATING_OUT' })
        const insights = run([...baseline('2026-10'), dinner('2026-10', 64)], [...baseline('2026-09'), dinner('2026-09', 48)])
        expect(insights.find((i) => i.id === 'price-rises')).toBeUndefined()
    })

    it('spots a price rise on a regular payment, ranked first', () => {
        const cur = baseline('2026-10')
        cur[2] = { ...cur[2], amount: 49 } // EE went from £45 to £49
        const insights = run(cur, baseline('2026-09'))
        expect(plain(insights[0].title)).toBe('EE went up from £45 to £49')
        expect(insights[0].waste).toBe(true)
    })
})

describe('buildInsights: big levers and trends', () => {
    const eat = (month: string, total: number) => [tx(d(4, month), total, { merchant: 'Dishoom', category: 'EATING_OUT' })]

    it('calls out a category climbing three months running', () => {
        const insights = run(
            [...baseline('2026-10'), ...eat('2026-10', 200)], // 200 by the 20th → ~£310 for October
            [...baseline('2026-09'), ...eat('2026-09', 150)],
            [...baseline('2026-08'), ...eat('2026-08', 100)]
        )
        const trend = insights.find((i) => i.id === 'trend-EATING_OUT')!
        expect(plain(trend.title)).toBe('Eating out has climbed three months running')
        expect(trend.saving).toBeCloseTo(210, 0)
    })

    it('counts a trend and a rise in the same category once', () => {
        const insights = run(
            [...baseline('2026-10'), ...eat('2026-10', 200)],
            [...baseline('2026-09'), ...eat('2026-09', 20)],
            [...baseline('2026-08'), ...eat('2026-08', 10)]
        )
        const eating = insights.filter((i) => i.group === 'EATING_OUT')
        expect(eating.length).toBeGreaterThan(1)
        expect(totalSaving(insights)).toBeCloseTo(Math.max(...eating.map((i) => i.saving ?? 0)), 2)
    })

    it('names treats that are down as room to spend', () => {
        const insights = run(baseline('2026-10'), [...baseline('2026-09'), tx(d(5, '2026-09'), 150, { merchant: 'Argos', category: 'SHOPPING' })])
        expect(plain(insights.find((i) => i.id === 'down-SHOPPING')!.title)).toBe('Shopping is down £150 on September')
    })

    it('says nothing about an empty month', () => {
        const empty = buildMonthStatement('2026-10', [], baseline('2026-09'), '2026-10-02')
        expect(buildInsights(empty, baseline('2026-09'), 'September')).toEqual([])
    })
})

describe('buildInsights: where the month is heading', () => {
    it('explains the forecast without running rent forward', () => {
        const shopping = [tx(d(8), 140, { merchant: 'Zara', category: 'SHOPPING' }), tx(d(15), 140, { merchant: 'Zara', category: 'SHOPPING' })]
        const pace = run([...baseline('2026-10'), ...shopping], baseline('2026-09')).find((i) => i.id === 'pace')!
        const text = plain(pace.detail)
        // Rent and bills are counted once, not scaled up to the end of the month.
        expect(plain(pace.title)).toMatch(/^Heading for about £\d/)
        expect(text).toMatch(/spent so far, plus about £[\d.]+ of day-to-day spend\./)
        expect(text).toContain('The biggest jump is Shopping, up £280.')
    })
})

describe('kindTotals', () => {
    it('splits the month into essentials, lifestyle and other', () => {
        const s = buildMonthStatement(
            '2026-10',
            [tx('2026-10-01', 50), tx('2026-10-02', 20, { category: 'EATING_OUT' }), tx('2026-10-03', 100, { category: 'PAYMENTS' })],
            [],
            '2026-10-05'
        )
        expect(kindTotals(s).map((k) => [k.kind, k.total])).toEqual([
            ['essential', 50],
            ['lifestyle', 20],
            ['other', 100],
        ])
    })
})
