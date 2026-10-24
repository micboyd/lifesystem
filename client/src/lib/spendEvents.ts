import type { Event, EventType, Part, StarlingSpendItem } from '../types'

/**
 * Ties spend to the calendar: each payment is matched to the event that was on
 * when it happened, so the Statement can say what plans cost ("£46 around
 * Dinner with Sam") and roughly what the ones still to come might.
 *
 * It's a best guess from timing and names, so each kind of event only claims
 * spend that plausibly belongs to it:
 * - Trips cover everything while you're away, groceries included.
 * - Social plans claim going-out spend: food, drinks, tickets, gifts, paying a
 *   friend back. Taxis and buses only around a plan's set time (the ride home).
 * - Hobbies claim the club bar, kit, subs and tickets, transport the same way.
 * - General events ("Cleaner", "Dentist") claim gifts, and otherwise only a
 *   payment whose name matches the event.
 * - Any event claims a payment that names it, on its days, whatever the category.
 * - Occasions (a birthday, a wedding, a leaving do) claim the gift run before
 *   them: shopping on the day before it starts, and gifts, cards and flowers
 *   from up to three days ahead.
 * - Bills never belong to an event.
 *
 * Pure, so it's easy to test.
 */

const PART_INDEX: Record<Exclude<Part, 'na'>, number> = { morning: 0, afternoon: 1, evening: 2 }

/** Morning before noon, afternoon to 5pm, evening after. Small hours belong to the night before. */
function slotOf(t: StarlingSpendItem): { date: string; part: number; minutes: number } {
    const d = new Date(t.time)
    const hour = d.getHours()
    if (hour < 5) {
        const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
        const date = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
        return { date, part: 2, minutes: (hour + 24) * 60 + d.getMinutes() }
    }
    return { date: t.date, part: hour < 12 ? 0 : hour < 17 ? 1 : 2, minutes: hour * 60 + d.getMinutes() }
}

// What each kind of event can claim on timing alone. Transport is never here:
// it's only claimed around a set time, or by a trip.
const CLAIMS: Record<EventType, Set<string>> = {
    trip: new Set(),
    worktrip: new Set(),
    social: new Set(['EATING_OUT', 'DRINKS', 'ENTERTAINMENT', 'LIFESTYLE', 'PAYMENTS', 'GIFTS', 'HOLIDAYS']),
    hobby: new Set(['EATING_OUT', 'DRINKS', 'ENTERTAINMENT', 'LIFESTYLE', 'PAYMENTS', 'FITNESS', 'SHOPPING']),
    general: new Set(['GIFTS']),
}
const TIMED_TRANSPORT: EventType[] = ['social', 'hobby']
const NEVER = new Set(['BILLS_AND_SERVICES'])
const TRIPS: EventType[] = ['trip', 'worktrip']

/** A spend window for timed events: an hour before, six after (the ride home). */
const TIMED_BEFORE = 60
const TIMED_AFTER = 6 * 60

const STOP = new Set(['with', 'and', 'the', 'for', 'from', 'night', 'day', 'drinks', 'dinner', 'lunch', 'party', 'trip', 'event', 'ltd', 'limited', 'services', 'payment'])
const words = (text: string) =>
    new Set(
        text
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length >= 4 && !STOP.has(w))
            // "cleaner"/"cleaning" → "clean", so near forms still meet.
            .map((w) => w.slice(0, 5))
    )

/** The payment names the event: a shared word between merchant and title or location. */
function namesEvent(e: Event, t: StarlingSpendItem): boolean {
    const a = words(`${e.title} ${e.location ?? ''}`)
    for (const w of words(t.merchant ?? '')) if (a.has(w)) return true
    return false
}

// Occasions you'd buy something for, by what the calendar calls them.
const OCCASION =
    /birthday|b-?day|\bparty\b|wedding|christening|baptism|shower|anniversary|leaving|engagement|housewarming|christmas|xmas|retirement|graduation|hen do|stag do/i
// Shops whose name says "present".
const GIFT_SHOP =
    /\btoys?\b|smyths|hamleys|entertainer|lego|card factory|clintons|moonpig|funky pigeon|interflora|florist|flowers|bloom|gift|hobbycraft|build-a-bear|waterstones|disney store/i
const GIFT_DAYS_AHEAD = 3
// When each part of the day starts, in minutes, for "before the event".
const PART_START: Record<Exclude<Part, 'na'>, number> = { morning: 5 * 60, afternoon: 12 * 60, evening: 17 * 60 }

/** Buying for the occasion: on the day before it starts, or a gift from a few days ahead. */
function giftRun(e: Event, t: StarlingSpendItem, slot: ReturnType<typeof slotOf>): boolean {
    if (!OCCASION.test(e.title)) return false
    const daysAhead = Math.round((Date.parse(e.startDate) - Date.parse(slot.date)) / 86_400_000)
    if (daysAhead < 0 || daysAhead > GIFT_DAYS_AHEAD) return false
    const giftish = t.category === 'GIFTS' || GIFT_SHOP.test(t.merchant ?? '')
    if (daysAhead > 0) return giftish
    // On the day: a gift, or shopping for one, before it starts.
    const startsAt = e.time
        ? Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3, 5))
        : e.allDay || e.startPart === 'na'
          ? 24 * 60
          : PART_START[e.startPart]
    return slot.minutes <= startsAt && (giftish || t.category === 'SHOPPING' || t.category === 'FAMILY')
}

type Hit = { hit: boolean; precise: boolean }
const MISS: Hit = { hit: false, precise: false }

/** Is the payment inside the event's days and parts of the day? */
function within(e: Event, slot: ReturnType<typeof slotOf>): boolean {
    if (slot.date < e.startDate || slot.date > e.endDate) return false
    if (e.allDay) return true
    const from = e.startPart === 'na' ? 0 : PART_INDEX[e.startPart]
    const to = e.endPart === 'na' ? 2 : PART_INDEX[e.endPart]
    if (slot.date === e.startDate && slot.part < from) return false
    if (slot.date === e.endDate && slot.part > to) return false
    return true
}

function covers(e: Event, t: StarlingSpendItem): Hit {
    const category = t.category ?? ''
    if (NEVER.has(category)) return MISS
    const slot = slotOf(t)
    const onItsDays = slot.date >= e.startDate && slot.date <= e.endDate

    // Named outright: the strongest link there is.
    if (onItsDays && namesEvent(e, t)) return { hit: true, precise: true }
    // The present for it, bought on the way or a few days before.
    if (giftRun(e, t, slot)) return { hit: true, precise: true }

    if (TRIPS.includes(e.eventType)) return { hit: within(e, slot), precise: false }

    // A single-day event with a time: match around that time.
    if (e.time && !e.allDay && e.startDate === e.endDate) {
        if (slot.date !== e.startDate) return MISS
        const [h, m] = e.time.split(':').map(Number)
        const at = h * 60 + m
        const near = slot.minutes >= at - TIMED_BEFORE && slot.minutes <= at + TIMED_AFTER
        const claims =
            CLAIMS[e.eventType].has(category) || (category === 'TRANSPORT' && TIMED_TRANSPORT.includes(e.eventType))
        return { hit: near && claims, precise: true }
    }

    if (!CLAIMS[e.eventType].has(category)) return MISS
    return { hit: within(e, slot), precise: false }
}

function spanDays(e: Event): number {
    return (Date.parse(e.endDate) - Date.parse(e.startDate)) / 86_400_000
}

/** Recurring occurrences share an _id, so key on the id and the day it starts. */
export const eventKey = (e: Event) => `${e._id}|${e.startDate}`

export interface EventSpend {
    event: Event
    total: number
    items: StarlingSpendItem[]
}

export interface SpendByEvent {
    /** Events with spend against them, most expensive first. */
    events: EventSpend[]
    /** Payment id → the event it was matched to. */
    byItem: Map<string, Event>
    planned: number
    everyday: number
}

/** Match each payment to the most specific event on at the time, if any. */
export function matchSpendToEvents(items: StarlingSpendItem[], events: Event[]): SpendByEvent {
    const byItem = new Map<string, Event>()
    const groups = new Map<string, EventSpend>()
    let planned = 0
    let everyday = 0

    for (const t of items) {
        let best: { e: Event; precise: boolean; span: number } | null = null
        for (const e of events) {
            const { hit, precise } = covers(e, t)
            if (!hit) continue
            const span = spanDays(e)
            // A timed match beats a day match; a short event beats a long one.
            if (!best || (precise && !best.precise) || (precise === best.precise && span < best.span)) {
                best = { e, precise, span }
            }
        }
        if (!best) {
            everyday += t.amount
            continue
        }
        planned += t.amount
        byItem.set(t.id, best.e)
        const key = eventKey(best.e)
        const g = groups.get(key) ?? { event: best.e, total: 0, items: [] }
        g.total = Math.round((g.total + t.amount) * 100) / 100
        g.items.push(t)
        groups.set(key, g)
    }

    return {
        events: [...groups.values()].sort((a, b) => b.total - a.total),
        byItem,
        planned: Math.round(planned * 100) / 100,
        everyday: Math.round(everyday * 100) / 100,
    }
}

export interface UpcomingPlan {
    event: Event
    /** What plans of this kind have cost, on average. Null with nothing to go on. */
    typical: number | null
}

/**
 * Plans still to come, each with what that kind of plan has typically cost.
 * "Typical" averages past events of the same type that had any spend at all,
 * so a work meeting that cost nothing doesn't drag a night out's estimate down.
 */
export function upcomingPlans(events: Event[], matched: SpendByEvent, today: string, until: string): UpcomingPlan[] {
    const costs = new Map<EventType, number[]>()
    for (const g of matched.events) {
        if (g.event.startDate >= today) continue
        costs.set(g.event.eventType, [...(costs.get(g.event.eventType) ?? []), g.total])
    }
    const seen = new Set<string>()
    return events
        .filter((e) => e.startDate > today && e.startDate <= until)
        .filter((e) => {
            const k = eventKey(e)
            if (seen.has(k)) return false
            seen.add(k)
            return true
        })
        .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
        .map((event) => {
            const past = costs.get(event.eventType) ?? []
            return {
                event,
                typical: past.length ? Math.round((past.reduce((a, b) => a + b, 0) / past.length) * 100) / 100 : null,
            }
        })
}
