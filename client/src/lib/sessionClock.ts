/**
 * The session clock: a strength workout or conditioning session run against the
 * planned slot of each item ("squats 15 → 30"). You start the clock when you
 * start the session and tap each item off as you finish it; the clock is only a
 * guide to where you are, so running over just shows as "behind".
 *
 * Kept on the device, like the strength log draft — a locked phone or a reload
 * mid-session mustn't reset the clock or lose the taps.
 */

/** An item's planned slot, in minutes from the start of the session. */
export interface Slot {
    startMin?: number
    endMin?: number
}

export interface ClockState {
    /** ms since epoch when the clock was started, or null before it is. */
    startedAt: number | null
    /** Minute mark each item was tapped done at, keyed by the item's index. */
    doneAt: Record<number, number>
}

export const EMPTY_CLOCK: ClockState = { startedAt: null, doneAt: {} }

/** Whether an item has a usable planned slot. */
export function hasSlot(s: Slot): s is Required<Slot> {
    return s.startMin !== undefined && s.endMin !== undefined && s.endMin > s.startMin
}

/** Minutes → "M:SS", e.g. 27.5 → "27:30". */
export function clockLabel(min: number): string {
    const total = Math.max(0, Math.round(min * 60))
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

/** A slot as "15–30", falling back to "M:SS" marks when either isn't whole. */
export function slotLabel(s: Required<Slot>): string {
    const whole = Number.isInteger(s.startMin) && Number.isInteger(s.endMin)
    return whole
        ? `${s.startMin}–${s.endMin}`
        : `${clockLabel(s.startMin)}–${clockLabel(s.endMin)}`
}

/** Minutes elapsed on the clock at `now`, or 0 before it's started. */
export function elapsedMin(state: ClockState, now: number): number {
    return state.startedAt === null ? 0 : Math.max(0, (now - state.startedAt) / 60000)
}

/** Round a minute mark to the second, the precision a tap is stored at. */
export function toSecondMark(min: number): number {
    return Math.round(min * 60) / 60
}

export type Pace =
    | { kind: 'idle' }
    | { kind: 'done' }
    | { kind: 'on' }
    | { kind: 'behind'; min: number }
    | { kind: 'ahead'; min: number }

/**
 * Where you are against the plan: the first item not yet done is "now". Past
 * its end, you're behind by the overrun; with everything before it done and its
 * slot not yet reached, you're ahead. Items without a slot don't count.
 */
export function paceOf(slots: Slot[], state: ClockState, elapsed: number): Pace {
    if (state.startedAt === null) return { kind: 'idle' }
    const next = slots.findIndex((s, i) => hasSlot(s) && state.doneAt[i] === undefined)
    if (next === -1) return { kind: 'done' }
    const s = slots[next] as Required<Slot>
    if (elapsed > s.endMin) return { kind: 'behind', min: Math.floor(elapsed - s.endMin) }
    if (elapsed < s.startMin) {
        const ahead = Math.floor(s.startMin - elapsed)
        if (ahead >= 1) return { kind: 'ahead', min: ahead }
    }
    return { kind: 'on' }
}

/** The index of the item you should be on — the first timed one not yet done. */
export function currentIndex(slots: Slot[], state: ClockState): number {
    return slots.findIndex((s, i) => hasSlot(s) && state.doneAt[i] === undefined)
}

// ─── Device storage ─────────────────────────────────────────────────────────────

const KEY_PREFIX = 'sessionClock:'

/** A clock left running from yesterday shouldn't come back on top of today. */
export const CLOCK_TTL_MS = 24 * 60 * 60 * 1000

export function readClock(key: string, now: number = Date.now()): ClockState {
    try {
        const raw = localStorage.getItem(KEY_PREFIX + key)
        if (!raw) return EMPTY_CLOCK
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const startedAt = typeof parsed.startedAt === 'number' ? parsed.startedAt : null
        if (startedAt === null || now - startedAt > CLOCK_TTL_MS) return EMPTY_CLOCK
        const doneAt: Record<number, number> = {}
        if (parsed.doneAt && typeof parsed.doneAt === 'object') {
            for (const [k, v] of Object.entries(parsed.doneAt as Record<string, unknown>)) {
                const i = Number(k)
                if (Number.isInteger(i) && i >= 0 && typeof v === 'number' && v >= 0) doneAt[i] = v
            }
        }
        return { startedAt, doneAt }
    } catch {
        return EMPTY_CLOCK
    }
}

export function writeClock(key: string, state: ClockState): void {
    try {
        if (state.startedAt === null) localStorage.removeItem(KEY_PREFIX + key)
        else localStorage.setItem(KEY_PREFIX + key, JSON.stringify(state))
    } catch {
        /* best-effort */
    }
}

export function clearClock(key: string): void {
    try {
        localStorage.removeItem(KEY_PREFIX + key)
    } catch {
        /* best-effort */
    }
}
