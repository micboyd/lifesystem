/**
 * Dev only: a made-up but realistic September and October, for viewing the
 * Statement as it looks on 1 November with nothing spent yet. Open
 * /finances/statement?mock=first-of-month on the dev server. Production builds
 * never load this file (the page only imports it behind import.meta.env.DEV).
 */
import type { StarlingSpendItem, Event } from '../types'

let n = 0
function tx(date: string, hhmm: string, amount: number, merchant: string, category: string): StarlingSpendItem {
    n++
    return { id: `m${n}`, date, time: `${date}T${hhmm}:00`, amount, merchant, category, space: 'Main account' }
}
const d = (m: string, day: number) => `${m}-${String(day).padStart(2, '0')}`

function month(m: string, heavier: boolean, dinners = 1): StarlingSpendItem[] {
    const out: StarlingSpendItem[] = [
        tx(d(m, 1), '09:00', 1200, 'Landlord', 'PAYMENTS'),
        tx(d(m, 5), '06:00', 45, 'EE', 'BILLS_AND_SERVICES'),
        tx(d(m, 12), '06:00', 92, 'Octopus Energy', 'BILLS_AND_SERVICES'),
        tx(d(m, 15), '06:00', 148, 'City of Edinburgh Council', 'BILLS_AND_SERVICES'),
        tx(d(m, 3), '06:00', 10.99, 'Netflix', 'ENTERTAINMENT'),
        tx(d(m, 9), '06:00', 11.99, 'Spotify', 'ENTERTAINMENT'),
        tx(d(m, 20), '06:00', 24.99, 'PureGym', 'FITNESS'),
    ]
    for (const day of [2, 9, 16, 23, 30]) out.push(tx(d(m, day), '18:00', heavier ? 68 : 61, 'Tesco', 'GROCERIES'))
    for (const day of [6, 7, 8, 13, 14, 15, 20, 21, 22, 27]) out.push(tx(d(m, day), '08:15', 3.4, 'Origin Coffee', 'EATING_OUT'))
    for (const day of [4, 11, 18, 25]) for (const at of ['15:01', '16:07', '17:27']) out.push(tx(d(m, day), at, 4.5, 'Portobello Rug', 'EATING_OUT'))
    out.push(tx(d(m, 10), '20:30', heavier ? 64 : 48, 'Dishoom', 'EATING_OUT'))
    // Eating out creeps up through the year: more dinners in later months.
    for (let i = 1; i < dinners; i++) out.push(tx(d(m, 4 + i * 5), '20:15', 42, 'Wagamama', 'EATING_OUT'))
    out.push(tx(d(m, 17), '21:10', 38, 'The Kings Head', 'EATING_OUT'))
    for (const day of [3, 17, 24]) out.push(tx(d(m, day), '23:40', 14.5, 'Uber', 'TRANSPORT'))
    for (const day of [6, 13, 20, 27]) out.push(tx(d(m, day), '08:36', 2, 'Lothian Buses', 'TRANSPORT'))
    if (heavier) {
        out.push(tx(d(m, 3), '11:05', 105, 'UNIQLO', 'SHOPPING'))
        out.push(tx(d(m, 19), '13:40', 89, 'Zara', 'SHOPPING'))
        out.push(tx(d(m, 10), '19:45', 26, 'Deliveroo', 'EATING_OUT')) // day after a Tesco shop
        out.push(tx(d(m, 25), '02:14', 28.5, 'Uber Eats', 'EATING_OUT')) // 2am
        out.push(tx(d(m, 12), '14:00', 20, 'Bet365', 'GAMBLING'))
    }
    return out
}

// A year of history before September, with eating out creeping up and shopping easing off.
const YEAR = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
const historyOut = YEAR.flatMap((m, i) => {
    const out = month(m, i % 4 === 1, i < 5 ? 1 : i < 8 ? 2 : 3)
    if (i < 5) out.push(tx(d(m, 8), '13:00', 140, 'ASOS', 'SHOPPING'))
    if (m === '2025-12') out.push(tx(d(m, 18), '14:00', 260, 'John Lewis', 'SHOPPING'))
    return out
})

export const items: StarlingSpendItem[] = [...historyOut, ...month('2026-09', false, 3), ...month('2026-10', true, 4)]

function credit(date: string, amount: number, merchant: string, source: string): StarlingSpendItem {
    n++
    return { id: `in${n}`, date, time: `${date}T07:00:00`, amount, merchant, category: null, space: 'Main account', direction: 'IN', source }
}
/** Money in: pay on the 25th (23rd when the 25th is a weekend), a refund, a mate paying back, interest. */
export const incoming: StarlingSpendItem[] = [
    ...[...YEAR, '2026-09', '2026-10'].map((m) => credit(d(m, m === '2026-10' ? 23 : 25), 3200, 'ACME LTD', 'DIRECT_CREDIT')),
    credit('2026-10-12', 29, 'Zara', 'MASTER_CARD'),
    credit('2026-10-14', 20, 'Sam Jones', 'FASTER_PAYMENTS_IN'),
    credit('2026-09-30', 1.08, 'Interest earned', 'INTEREST_PAYMENT'),
]

/** What's in the account right now. */
export const balance = { main: 640.25, spaces: 1180, total: 1820.25, asOf: new Date().toISOString() }

/** "Today" in each mock: 1 November (nothing spent yet), or Thursday 22 October. */
export const today = { 'first-of-month': '2026-11-01', 'mid-month': '2026-10-22' } as const
export type MockName = keyof typeof today

/** Stored history as the server would return it: every finished month before `month`, money in and out. */
export function historyBefore(month: string) {
    const all = [...items, ...incoming]
    const months = [...new Set(all.map((t) => t.date.slice(0, 7)))].filter((m) => m < month).sort().reverse().slice(0, 12)
    return { months: months.map((m) => ({ month: m, items: all.filter((t) => t.date.startsWith(m)) })), pending: 0 }
}

function ev(title: string, startDate: string, extra: Partial<Event> = {}): Event {
    n++
    return { _id: `e${n}`, title, eventType: 'social', allDay: false, startDate, startPart: 'evening', endDate: startDate, endPart: 'evening', createdAt: '', updatedAt: '', ...extra }
}
export const events: Event[] = [
    ev('Dinner with Sam', '2026-10-10', { time: '20:00' }),
    ev('Rugby', '2026-10-18', { eventType: 'hobby', startPart: 'afternoon' }),
    ev('Drinks with work', '2026-11-06', { time: '18:30' }),
    ev("Ella's birthday", '2026-11-14', { time: '14:00' }),
    ev('Rugby', '2026-11-15', { eventType: 'hobby', startPart: 'afternoon' }),
    ev('London', '2026-11-20', { eventType: 'trip', startPart: 'afternoon', endDate: '2026-11-22', endPart: 'evening' }),
]

/** Monthly-sheet income for November in the mock. */
export const income = 3200
