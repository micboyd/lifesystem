import { FITNESS_PLAN_PARTS } from '../types'
import type { FitnessPlanKind, FitnessPlanPart } from '../types'

/**
 * Overloading: two hard sessions asked of the same slot of the same day — two
 * strength, two conditioning, or one of each.
 *
 * It isn't a diary conflict like a calendar clash; the slot is free, it's the
 * training load in one sitting that's the problem. Both the weekly planner and
 * the plans tab flag it, over different shapes of data — placed planner entries
 * on one side, a plan's materialised schedule on the other — so the rule lives
 * here once and both read it the same way.
 */

/** All a planned thing needs for its load to be worked out: when it falls, and what it is. */
export interface SlotItem {
    date: string
    /** Legacy planner entries carry no slot; they're read as morning. */
    part?: FitnessPlanPart
    kind: FitnessPlanKind
}

/** A slot of one day carrying more than one hard session. */
export interface Overload<T extends SlotItem> {
    date: string
    part: FitnessPlanPart
    /** The hard sessions sharing the slot, in the order they were given. */
    entries: T[]
}

/**
 * Whether a kind counts towards a slot's load. Mobility and recovery never
 * overload a slot — they're what you'd pair a hard session with — so only
 * strength and conditioning are weighed.
 */
export function isHardSession(kind: FitnessPlanKind): boolean {
    return kind === 'workout' || kind === 'conditioning'
}

/** The slot an item sits in, defaulting ones with no slot recorded to morning. */
export function slotOf(item: SlotItem): FitnessPlanPart {
    return item.part ?? 'morning'
}

/** At most this many planned sessions share one slot — the planner's own limit. */
const SLOT_CAPACITY = 2

/**
 * Every overloaded slot across `items`, day by day and slot by slot, in date
 * then slot order. Items may span any stretch of time: one day, a week, or a
 * whole training block.
 */
export function findOverloads<T extends SlotItem>(items: T[]): Overload<T>[] {
    const byDate = new Map<string, T[]>()
    for (const item of items) {
        const list = byDate.get(item.date)
        if (list) list.push(item)
        else byDate.set(item.date, [item])
    }

    const found: Overload<T>[] = []
    for (const date of [...byDate.keys()].sort()) {
        const dayItems = byDate.get(date)!
        for (const part of FITNESS_PLAN_PARTS) {
            const hard = dayItems.filter((e) => slotOf(e) === part && isHardSession(e.kind))
            if (hard.length > 1) found.push({ date, part, entries: hard })
        }
    }
    return found
}

/**
 * The nearest slot on the item's own day it could move to, to break up an
 * overloaded one: a slot holding no hard session of its own — landing beside one
 * would only move the overload along — nor a full complement of items already,
 * and that `blocked` doesn't rule out. Slots are tried by distance from the
 * current one, the later of two equals winning, so an afternoon session drifts
 * to the evening rather than back to the morning.
 *
 * `dayItems` is everything planned that day, `item` included; it's matched by
 * identity, so pass the very object that came out of the list. `blocked` is how
 * a caller rules out slots for its own reasons — the planner uses it to keep a
 * session out of a slot a calendar event already covers. Returns null when the
 * day has nowhere free to put it.
 */
export function findFreeSlot<T extends SlotItem>(
    item: T,
    dayItems: T[],
    blocked: (part: FitnessPlanPart) => boolean = () => false
): FitnessPlanPart | null {
    const current = slotOf(item)
    const currentIndex = FITNESS_PLAN_PARTS.indexOf(current)
    const candidates = FITNESS_PLAN_PARTS.filter((p) => p !== current).sort((a, b) => {
        const da = Math.abs(FITNESS_PLAN_PARTS.indexOf(a) - currentIndex)
        const db = Math.abs(FITNESS_PLAN_PARTS.indexOf(b) - currentIndex)
        if (da !== db) return da - db
        return FITNESS_PLAN_PARTS.indexOf(b) - FITNESS_PLAN_PARTS.indexOf(a)
    })

    for (const part of candidates) {
        const inSlot = dayItems.filter((e) => e !== item && slotOf(e) === part)
        if (inSlot.length >= SLOT_CAPACITY) continue
        if (inSlot.some((e) => isHardSession(e.kind))) continue
        if (blocked(part)) continue
        return part
    }
    return null
}
