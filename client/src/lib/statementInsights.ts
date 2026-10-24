import type { StarlingSpendItem } from '../types'
import { categoryLabel, type MonthStatement } from './monthStatement'

/**
 * What the Statement says about a month: a needs / treats / other split, and a
 * short ranked list of things worth doing about it — where to save, what to
 * keep an eye on, and where there's room to spend.
 *
 * Pure. Copy carries money as `{ money }` parts rather than formatted strings,
 * so the page formats it at render time (the hide-money mask still applies, and
 * only the figure itself is set in the mono font).
 */

export type SpendKind = 'essential' | 'lifestyle' | 'other'

const KIND: Record<string, SpendKind> = {
    GROCERIES: 'essential',
    BILLS_AND_SERVICES: 'essential',
    TRANSPORT: 'essential',
    HOME: 'essential',
    FAMILY: 'essential',
    PETS: 'essential',
    EATING_OUT: 'lifestyle',
    DRINKS: 'lifestyle',
    SHOPPING: 'lifestyle',
    ENTERTAINMENT: 'lifestyle',
    LIFESTYLE: 'lifestyle',
    HOLIDAYS: 'lifestyle',
    GIFTS: 'lifestyle',
    GAMBLING: 'lifestyle',
    PERSONAL_CARE: 'lifestyle',
    FITNESS: 'lifestyle',
}

/** Starling category → needs, treats, or other (transfers, payments to people, uncategorised). */
export function spendKind(category: string | null): SpendKind {
    return KIND[category ?? ''] ?? 'other'
}

export const KIND_LABEL: Record<SpendKind, string> = {
    essential: 'Essentials',
    lifestyle: 'Lifestyle',
    other: 'Transfers & other',
}

export interface KindTotal {
    kind: SpendKind
    total: number
    /** Last month up to the same day. */
    prevTotal: number
}

/** One run of copy: plain text and money figures. */
export type Copy = (string | { money: number })[]

export type InsightTone = 'save' | 'watch' | 'good'

export interface Insight {
    id: string
    tone: InsightTone
    icon: string
    /** What it's about in a few words, e.g. "Eating out" — titles the drill-in. */
    subject: string
    title: Copy
    detail: Copy
    /** Roughly what acting on it frees up over a month, in £. */
    saving?: number
    /** Plain waste (a price rise): shown at any size, ranked first. */
    waste?: boolean
    /** Savings that overlap (a habit inside a rising category) share a group; only the larger counts. */
    group?: string
    /** The payments behind it, for the drill-in. */
    items: StarlingSpendItem[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number) => ({ money: round2(n) })
const merchantKey = (t: StarlingSpendItem) => (t.merchant ?? 'Unknown').trim().toLowerCase()

export function kindTotals(s: MonthStatement): KindTotal[] {
    const by = new Map<SpendKind, KindTotal>()
    for (const kind of ['essential', 'lifestyle', 'other'] as const) by.set(kind, { kind, total: 0, prevTotal: 0 })
    for (const c of s.categories) {
        const k = by.get(spendKind(c.key === 'NONE' ? null : c.key))!
        k.total = round2(k.total + c.total)
        k.prevTotal = round2(k.prevTotal + c.prevTotal)
    }
    return [...by.values()]
}

// What makes the cut. The aim is a few big levers, not a list of everything:
// a card has to be worth a real slice of the month, unless it's plain waste
// (a double charge, a fee, a price rise), which is worth knowing at any size.
const MATERIAL_SHARE = 0.03 // of a normal month's spend
const MATERIAL_MIN = 40 // £, and never less than this
const MIN_CHANGE_PCT = 0.25
const HABIT_MIN_PAYMENTS = 6
const HABIT_MAX_AVERAGE = 12
const HABIT_SHARE = 0.05 // a habit has to run to this share of the month
const HABIT_MIN = 80
const REGULAR_TOLERANCE = 0.03 // same amount as last month, within 3%
const PRICE_RISE_MAX = 0.5 // more than +50% is a different purchase, not a price rise
// Where a "price rise" means something: bills, subscriptions, memberships, rent.
// A dearer dinner or a bigger shop is just a different purchase.
const PRICED = new Set(['BILLS_AND_SERVICES', 'ENTERTAINMENT', 'FITNESS', 'PAYMENTS'])
const PACE_MIN_DAY = 5 // projections before this are guesswork

const DELIVERY = /deliveroo|uber\s*eats|just\s*eat|getir|gopuff|beelivery/i

export interface OlderMonth {
    /** e.g. "August" */
    name: string
    /** The whole of the month before last. */
    items: StarlingSpendItem[]
    month: string
}

/**
 * @param s the built statement
 * @param prevItems last month's spend (the same list handed to buildMonthStatement)
 * @param prevName e.g. "September", for the copy
 * @param older the month before that, when it's loaded, for three-month trends
 */
export function buildInsights(
    s: MonthStatement,
    prevItems: StarlingSpendItem[],
    prevName: string,
    older?: OlderMonth
): Insight[] {
    if (s.count === 0) return []
    const out: Insight[] = []
    const counted = s.categories.flatMap((c) => c.items)
    // Scale "so far" up to a whole month while it's running, once there's enough to go on.
    const paced = !s.isCurrent || s.dayOfMonth >= PACE_MIN_DAY
    const scale = s.isCurrent && paced ? s.daysInMonth / s.dayOfMonth : 1
    const byThisDay = s.isCurrent ? ' by this point' : ''
    // A "normal month" to size things against: the bigger of last month and this one's pace.
    const monthSize = Math.max(s.prev.fullTotal, s.total * scale)
    const material = Math.max(MATERIAL_MIN, monthSize * MATERIAL_SHARE)
    const prevAll = prevItems.filter((t) => t.date.startsWith(s.prev.month))

    // ── Waste, at any size ──
    // (Double charges, fees and bets live in the Doh list; a price rise isn't
    // your fault, so it stays here as something to haggle over.)
    const byPlace = new Map<string, StarlingSpendItem[]>()
    for (const t of counted) byPlace.set(merchantKey(t), [...(byPlace.get(merchantKey(t)) ?? []), t])

    // Regulars: same place as last month. Same amount = a bill or subscription;
    // a bit more = the price went up.
    const prevByMerchant = new Map<string, number[]>()
    for (const t of prevAll) prevByMerchant.set(merchantKey(t), [...(prevByMerchant.get(merchantKey(t)) ?? []), t.amount])
    const regulars: StarlingSpendItem[] = []
    const rises: { t: StarlingSpendItem; was: number }[] = []
    for (const t of counted) {
        const before = prevByMerchant.get(merchantKey(t)) ?? []
        if (before.some((a) => Math.abs(a - t.amount) <= Math.max(0.5, t.amount * REGULAR_TOLERANCE))) {
            regulars.push(t)
        } else if (
            PRICED.has(t.category ?? '') &&
            before.length === 1 &&
            (byPlace.get(merchantKey(t))?.length ?? 0) === 1 &&
            t.amount > before[0] + 0.5 &&
            t.amount <= before[0] * (1 + PRICE_RISE_MAX)
        ) {
            rises.push({ t, was: before[0] })
        }
    }
    if (rises.length) {
        const more = round2(rises.reduce((sum, r) => sum + r.t.amount - r.was, 0))
        const r = rises[0]
        out.push({
            id: 'price-rises',
            tone: 'save',
            waste: true,
            icon: 'fa-arrow-up-right-dots',
            subject: 'Price rises',
            title:
                rises.length === 1
                    ? [`${r.t.merchant ?? 'Unknown'} went up from `, money(r.was), ' to ', money(r.t.amount)]
                    : [`${rises.length} regular payments went up, `, money(more), ' more a month'],
            detail: ['Price rises slip through unnoticed. Worth a call to haggle, or a look at switching.'],
            saving: more,
            items: rises.map((x) => x.t),
        })
    }

    // ── Big levers ──

    // Three months running: a trend, not a blip.
    if (older && paced) {
        const olderAll = older.items.filter((t) => t.date.startsWith(older.month))
        const totalsBy = (items: StarlingSpendItem[]) => {
            const m = new Map<string, number>()
            for (const t of items) m.set(t.category ?? 'NONE', (m.get(t.category ?? 'NONE') ?? 0) + t.amount)
            return m
        }
        const o = totalsBy(olderAll)
        const p = totalsBy(prevAll)
        for (const c of s.categories) {
            if (spendKind(c.key) === 'other') continue
            const was = o.get(c.key) ?? 0
            const then = p.get(c.key) ?? 0
            const now = c.total * scale
            if (!(was > 0 && was < then && then < now && now - was >= material && now >= was * (1 + MIN_CHANGE_PCT))) continue
            out.push({
                id: `trend-${c.key}`,
                tone: 'save',
                icon: 'fa-chart-line',
                subject: c.label,
                title: [`${c.label} has climbed three months running`],
                detail: [
                    money(was), ` in ${older.name}, `, money(then), ` in ${prevName}, `,
                    s.isCurrent ? 'on track for ' : '', money(now), ' this month. Back to ', older.name, ' frees up ', money(now - was), '.',
                ],
                saving: round2(now - was),
                group: c.key,
                items: c.items,
            })
        }
    }

    // Lifestyle categories well up on last month.
    for (const c of s.categories) {
        if (spendKind(c.key) !== 'lifestyle') continue
        const diff = c.total - c.prevTotal
        const saving = round2(diff * scale)
        if (saving < material || (c.prevTotal > 0 && diff / c.prevTotal < MIN_CHANGE_PCT)) continue
        out.push({
            id: `up-${c.key}`,
            tone: 'save',
            icon: 'fa-arrow-trend-up',
            subject: c.label,
            title: [`${c.label} is up `, money(diff), ` on ${prevName}`],
            detail:
                c.prevTotal > 0
                    ? [money(c.total), ' so far, against ', money(c.prevTotal), `${byThisDay} in ${prevName}. Back to that pace and you keep `, money(saving), '.']
                    : [money(c.total), ` so far, where ${prevName} had nothing${byThisDay}.`],
            saving,
            group: c.key,
            items: c.items,
        })
    }

    // A habit only counts once it's big: lots of small payments adding up to a real sum.
    for (const m of s.merchants) {
        const monthly = m.total * scale
        if (
            m.count < HABIT_MIN_PAYMENTS ||
            m.total / m.count > HABIT_MAX_AVERAGE ||
            monthly < Math.max(HABIT_MIN, monthSize * HABIT_SHARE) ||
            !m.items.some((t) => spendKind(t.category) === 'lifestyle') ||
            DELIVERY.test(m.label)
        ) continue
        out.push({
            id: `habit-${m.key}`,
            tone: 'save',
            icon: 'fa-mug-hot',
            subject: m.label,
            title: [`${m.count} payments to ${m.label} run to `, money(monthly), ' a month'],
            detail: ['About ', money(m.total / m.count), ' a time, but it adds up. Halving it saves ', money(monthly / 2), '.'],
            saving: round2(monthly / 2),
            group: m.items[0]?.category ?? 'NONE',
            items: m.items,
        })
    }

    // ── Worth knowing ──

    // Where the month is heading against last month, in plain terms: what it's
    // made of, what's driving it, and what to keep to.
    const f = s.forecast
    if (s.isCurrent && s.projected !== null && f && s.dayOfMonth >= PACE_MIN_DAY && s.prev.fullTotal > 0) {
        const diff = s.projected - s.prev.fullTotal
        const makeup: Copy = [
            money(s.total),
            ' spent so far, plus about ',
            money(f.dayToDayRest),
            ' of day-to-day spend',
            ...(f.stillToCome > 0 ? [' and ', money(f.stillToCome), ' of bills still to come'] : []),
            '.',
        ]
        // Day-to-day room left before matching last month, once the bills are paid.
        const room = f.daysLeft > 0 ? (s.prev.fullTotal - s.total - f.stillToCome) / f.daysLeft : 0
        const driver = [...s.categories].sort((a, b) => b.total - b.prevTotal - (a.total - a.prevTotal))[0]
        const driverUp = driver ? driver.total - driver.prevTotal : 0
        if (diff >= material) {
            out.push({
                id: 'pace',
                tone: 'watch',
                icon: 'fa-gauge-high',
                subject: 'Where the month is heading',
                title: ['Heading for about ', money(s.projected), ', ', money(diff), ` more than ${prevName}`],
                detail: [
                    ...makeup,
                    ...(driver && driverUp >= material / 2 ? [` The biggest jump is ${driver.label}, up `, money(driverUp), '.'] : []),
                    ...(room >= 1 ? [` Keep day-to-day under `, money(room), ` a day to match ${prevName}.`] : []),
                ],
                items: driver && driverUp >= material / 2 ? driver.items : [],
            })
        } else if (-diff >= material) {
            out.push({
                id: 'pace',
                tone: 'good',
                icon: 'fa-gauge',
                subject: 'Where the month is heading',
                title: ['Heading for about ', money(s.projected), ', ', money(-diff), ` less than ${prevName}`],
                detail: [...makeup, ...(room >= 1 ? [' You’ve room for ', money(room), ' a day and still come in under.'] : [])],
                items: [],
            })
        }
    }

    // One payment doing a lot of the damage.
    if (s.biggest && s.count > 5 && s.biggest.amount / s.total >= 0.15 && spendKind(s.biggest.category) !== 'other') {
        out.push({
            id: 'big-one',
            tone: 'watch',
            icon: 'fa-receipt',
            subject: s.biggest.merchant ?? 'Biggest payment',
            title: [`One payment is ${Math.round((s.biggest.amount / s.total) * 100)}% of the month`],
            detail: [`${s.biggest.merchant ?? 'Unknown'}, `, money(s.biggest.amount), '. Take it out and the month looks very different.'],
            items: [s.biggest],
        })
    }

    // Bills and subscriptions, as one figure to review now and then.
    const regularPlaces = new Set(regulars.map(merchantKey))
    const regularTotal = regulars.reduce((sum, t) => sum + t.amount, 0)
    if (regularPlaces.size >= 3 && regularTotal >= material) {
        out.push({
            id: 'regulars',
            tone: 'watch',
            icon: 'fa-rotate',
            subject: 'Regular payments',
            title: [`${regularPlaces.size} regular payments come to `, money(regularTotal)],
            detail: [`Same place, same amount as ${prevName}: bills and subscriptions. The easiest money to save is the stuff you've stopped using.`],
            items: [...regulars].sort((a, b) => b.amount - a.amount),
        })
    }

    // Weekends against weekdays, when the gap is worth real money over a month.
    const weekend = { days: 0, total: 0, items: [] as StarlingSpendItem[] }
    const weekday = { days: 0, total: 0 }
    const isWeekend = (date: string) => {
        const [y, m, d] = date.split('-').map(Number)
        const dow = new Date(y, m - 1, d).getDay()
        return dow === 0 || dow === 6
    }
    for (const d of s.days) (isWeekend(d.date) ? weekend : weekday).days++
    for (const t of counted) {
        if (spendKind(t.category) !== 'lifestyle') continue
        if (isWeekend(t.date)) {
            weekend.total += t.amount
            weekend.items.push(t)
        } else weekday.total += t.amount
    }
    if (weekend.days >= 2 && weekday.days >= 3) {
        const we = weekend.total / weekend.days
        const wd = weekday.total / weekday.days
        // ~8.7 weekend days in a month.
        if (we >= wd * 1.5 && (we - wd) * 8.7 >= material) {
            out.push({
                id: 'weekends',
                tone: 'watch',
                icon: 'fa-champagne-glasses',
                subject: 'Weekend spend',
                title: ['Weekends cost ', money(we), ' a day on treats, weekdays ', money(wd)],
                detail: ['Deciding on one weekend treat in advance usually costs less than several on the day.'],
                items: weekend.items.sort((a, b) => (a.time < b.time ? 1 : -1)),
            })
        }
    }

    // ── Room to spend: treats down on last month ──
    // Read from last month's side, so a category with nothing spent yet still counts.
    const [py, pm] = s.prev.month.split('-').map(Number)
    const prevCut = `${s.prev.month}-${String(Math.min(s.dayOfMonth, new Date(py, pm, 0).getDate())).padStart(2, '0')}`
    const prevByCategory = new Map<string, number>()
    for (const t of prevAll) {
        if (t.date > prevCut || spendKind(t.category) !== 'lifestyle') continue
        prevByCategory.set(t.category!, (prevByCategory.get(t.category!) ?? 0) + t.amount)
    }
    const down = [...prevByCategory.entries()]
        .map(([key, prevTotal]) => {
            const c = s.categories.find((x) => x.key === key)
            return { key, label: categoryLabel(key), drop: prevTotal - (c?.total ?? 0), prevTotal, items: c?.items ?? [] }
        })
        .filter((c) => c.drop >= material / 2 && c.drop / c.prevTotal >= MIN_CHANGE_PCT)
        .sort((a, b) => b.drop - a.drop)
        .slice(0, 2)
    for (const c of down) {
        out.push({
            id: `down-${c.key}`,
            tone: 'good',
            icon: 'fa-arrow-trend-down',
            subject: c.label,
            title: [`${c.label} is down `, money(c.drop), ` on ${prevName}`],
            detail: c.items.length
                ? ['Room to spend there if you want it, and still be at last month’s level.']
                : ['Nothing on it yet this month. Room to spend there if you want it.'],
            items: c.items,
        })
    }

    if (s.noSpendDays >= 3) {
        out.push({
            id: 'no-spend',
            tone: 'good',
            icon: 'fa-leaf',
            subject: 'No-spend days',
            title: [`${s.noSpendDays} no-spend days${s.isCurrent ? ' so far' : ''}`],
            detail: [`That's ${Math.round((s.noSpendDays / s.dayOfMonth) * 100)}% of the month with nothing going out.`],
            items: [],
        })
    }

    // Waste first, then the biggest levers, then what to watch, then the good news.
    const rank = (i: Insight) => (i.waste ? 0 : i.tone === 'save' ? 1 : i.tone === 'watch' ? 2 : 3)
    return out.sort((a, b) => rank(a) - rank(b) || (b.saving ?? 0) - (a.saving ?? 0))
}

/** The headline "could save" figure: every save estimate, overlapping ones counted once. */
export function totalSaving(insights: Insight[]): number {
    const best = new Map<string, number>()
    for (const i of insights) {
        if (i.tone !== 'save' || !i.saving) continue
        const key = i.group ?? i.id
        best.set(key, Math.max(best.get(key) ?? 0, i.saving))
    }
    return round2([...best.values()].reduce((a, b) => a + b, 0))
}
