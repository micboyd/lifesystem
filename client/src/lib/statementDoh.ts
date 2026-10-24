import type { StarlingSpendItem } from '../types'
import type { Copy } from './statementInsights'

/**
 * The "Doh" list: money that bought nothing worth having. Not nights out or
 * treats — those are choices — but bets, 2am takeaways, delivering food when
 * there's a fresh shop in the fridge, fees, fines, paying twice. Each line says
 * what it cost, so the total reads as "you'd still have this if you hadn't".
 *
 * Pure. One payment only ever lands in one line, the first rule that fits.
 */

export interface DohLine {
    id: string
    icon: string
    /** Short name for the drill-in, e.g. "Late-night food". */
    subject: string
    title: Copy
    /** Why it's a doh, in a few words. */
    why: string
    /** What you'd have kept. */
    saved: number
    items: StarlingSpendItem[]
}

export interface Doh {
    total: number
    lines: DohLine[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number) => ({ money: round2(n) })
const sum = (items: StarlingSpendItem[]) => round2(items.reduce((s, t) => s + t.amount, 0))
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const GAMBLING =
    /bet365|paddy\s*power|sky\s*bet|skybet|william\s*hill|betfair|ladbrokes|\bcoral\b|betway|betfred|unibet|\b888|national lottery|lottoland|pokerstars|tombola|gala (bingo|casino)|grosvenor casino|sportingbet|boylesports|betvictor/i
const DELIVERY = /deliveroo|uber\s*eats|just\s*eat|getir|gopuff|beelivery|dominos|domino's|papa john/i
const FEE = /\b(fees?|interest|overdraft|late payment|penalty|charges?|pcn|parking fine|fixed penalty)\b/i
const MUSIC = /spotify|apple music|amazon music|youtube music|youtube premium|tidal|deezer/i
const VIDEO = /netflix|disney|prime video|now tv|nowtv|apple tv|paramount|discovery\+|britbox|itvx premium/i

/** Takeaway or shopping that small-hours you would never sign off on. */
const LATE_NIGHT_CATEGORIES = new Set(['EATING_OUT', 'SHOPPING', 'ENTERTAINMENT', 'LIFESTYLE', 'GAMBLING'])
const LATE_FROM = 0
const LATE_TO = 5 // up to 4:59am

const SHOP_MIN = 25 // £, a grocery shop big enough to count as "food in"
const AFTER_SHOP_HOURS = 36
/** Delivery fees and menu mark-ups, as a share of the order. */
const DELIVERY_PREMIUM = 0.3
const DUPLICATE_HOURS = 36
const DUPLICATE_MIN = 5
// Places where paying the same twice in a day or two is normal.
const REPEATABLE = new Set(['EATING_OUT', 'DRINKS', 'GROCERIES', 'TRANSPORT', 'PAYMENTS', 'LIFESTYLE'])

const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000
const label = (t: StarlingSpendItem) => (t.merchant ?? 'Unknown').trim()
const key = (t: StarlingSpendItem) => label(t).toLowerCase()

/** @param items the month's payments (only these are judged) */
export function buildDoh(items: StarlingSpendItem[]): Doh {
    const lines: DohLine[] = []
    const used = new Set<string>()
    const take = (list: StarlingSpendItem[]) => {
        const fresh = list.filter((t) => !used.has(t.id))
        for (const t of fresh) used.add(t.id)
        return fresh
    }
    const sorted = [...items].sort((a, b) => (a.time < b.time ? -1 : 1))

    // ── Betting ──
    const bets = take(sorted.filter((t) => t.category === 'GAMBLING' || GAMBLING.test(label(t))))
    if (bets.length) {
        lines.push({
            id: 'gambling',
            icon: 'fa-dice',
            subject: 'Betting',
            title: [plural(bets.length, 'bet'), ', ', money(sum(bets))],
            why: 'The house wins. Any winnings would show as money in, not here.',
            saved: sum(bets),
            items: bets,
        })
    }

    // ── Fees, interest, fines ──
    const fees = take(sorted.filter((t) => FEE.test(label(t)) && t.category !== 'GROCERIES'))
    if (fees.length) {
        lines.push({
            id: 'fees',
            icon: 'fa-file-invoice-dollar',
            subject: 'Fees and fines',
            title: [money(sum(fees)), ' in fees, interest and fines'],
            why: 'Paying for nothing. A moved date or a bit of organising avoids most of it.',
            saved: sum(fees),
            items: fees,
        })
    }

    // ── Paid twice ──
    const dupes: StarlingSpendItem[] = []
    const byPlace = new Map<string, StarlingSpendItem[]>()
    for (const t of sorted) byPlace.set(key(t), [...(byPlace.get(key(t)) ?? []), t])
    for (const list of byPlace.values()) {
        for (let i = 1; i < list.length; i++) {
            const [a, b] = [list[i - 1], list[i]]
            if (
                a.amount === b.amount &&
                b.amount >= DUPLICATE_MIN &&
                !REPEATABLE.has(b.category ?? '') &&
                hours(a.time, b.time) <= DUPLICATE_HOURS
            ) {
                dupes.push(b) // the second one is the extra
            }
        }
    }
    const extra = take(dupes)
    if (extra.length) {
        lines.push({
            id: 'duplicates',
            icon: 'fa-clone',
            subject: 'Paid twice',
            title:
                extra.length === 1
                    ? [`${label(extra[0])} charged you twice, `, money(extra[0].amount)]
                    : [`${extra.length} things paid for twice, `, money(sum(extra))],
            why: 'Same place, same amount, within a day and a half. Worth asking for it back.',
            saved: sum(extra),
            items: extra,
        })
    }

    // ── Small-hours food and shopping ──
    const late = take(
        sorted.filter((t) => {
            const h = new Date(t.time).getHours()
            return h >= LATE_FROM && h < LATE_TO && (LATE_NIGHT_CATEGORIES.has(t.category ?? '') || DELIVERY.test(label(t)))
        })
    )
    if (late.length) {
        lines.push({
            id: 'late-night',
            icon: 'fa-moon',
            subject: 'Small-hours spending',
            title:
                late.length === 1
                    ? [`${label(late[0])} at ${timeOf(late[0])}, `, money(late[0].amount)]
                    : [`${late.length} small-hours buys, `, money(sum(late))],
            why: 'Nothing good gets bought between midnight and 5am.',
            saved: sum(late),
            items: late,
        })
    }

    // ── Delivery with a fresh shop in ──
    const shops = sorted.filter((t) => t.category === 'GROCERIES' && t.amount >= SHOP_MIN && !DELIVERY.test(label(t)))
    const afterShop = take(
        sorted.filter(
            (t) =>
                DELIVERY.test(label(t)) &&
                shops.some((s) => {
                    const h = hours(s.time, t.time)
                    return h > 0 && h <= AFTER_SHOP_HOURS
                })
        )
    )
    if (afterShop.length) {
        lines.push({
            id: 'after-shop',
            icon: 'fa-basket-shopping',
            subject: 'Delivery with food in',
            title:
                afterShop.length === 1
                    ? [`${label(afterShop[0])} the day after a big shop, `, money(afterShop[0].amount)]
                    : [`${afterShop.length} deliveries right after a big shop, `, money(sum(afterShop))],
            why: 'There was food in the fridge.',
            saved: sum(afterShop),
            items: afterShop,
        })
    }

    // ── The delivery mark-up on everything else ──
    const delivered = take(sorted.filter((t) => DELIVERY.test(label(t))))
    if (delivered.length) {
        const premium = round2(sum(delivered) * DELIVERY_PREMIUM)
        lines.push({
            id: 'delivery-premium',
            icon: 'fa-motorcycle',
            subject: 'Delivery mark-up',
            title: ['About ', money(premium), ` in delivery fees and mark-up on ${plural(delivered.length, 'order')}`],
            why: 'Same food, collected or cooked, costs about a third less.',
            saved: premium,
            items: delivered,
        })
    }

    // ── Paying for the same thing twice over ──
    const latestBy = (re: RegExp) => {
        const m = new Map<string, StarlingSpendItem>()
        for (const t of sorted) if (re.test(label(t)) && !used.has(t.id)) m.set(key(t), t)
        return [...m.values()].sort((a, b) => b.amount - a.amount)
    }
    const music = latestBy(MUSIC)
    if (music.length >= 2) {
        const spare = take(music.slice(1))
        lines.push({
            id: 'music',
            icon: 'fa-music',
            subject: 'Music subscriptions',
            title: [`${music.map(label).join(' and ')}: two music services`],
            why: 'You can only listen to one at a time. Keep the one you use.',
            saved: sum(spare),
            items: music,
        })
    }
    const video = latestBy(VIDEO)
    if (video.length >= 3) {
        const spare = take(video.slice(1))
        lines.push({
            id: 'video',
            icon: 'fa-tv',
            subject: 'Streaming subscriptions',
            title: [`${video.length} streaming services at once, `, money(sum(video))],
            why: 'Rotate them: one a month, cancel, move on. Keep one, save the rest.',
            saved: sum(spare),
            items: video,
        })
    }

    lines.sort((a, b) => b.saved - a.saved)
    return { total: round2(lines.reduce((s, l) => s + l.saved, 0)), lines }
}

function timeOf(t: StarlingSpendItem): string {
    return new Date(t.time).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '')
}
