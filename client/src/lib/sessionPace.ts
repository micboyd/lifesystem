/**
 * Pace through a strength workout or conditioning session. Each item has a
 * planned slot ("squats 15 → 30", minutes into the session) and, in the gym, a
 * Completed button that stamps the time it was pressed. Comparing a completion
 * with the previous one against the planned gap between them says whether that
 * item ran on time; comparing it with the first completion says where the
 * session as a whole stands. There's no clock to start — the first press is the
 * reference point.
 */

/** An item's planned slot, in minutes from the start of the session. */
export interface Slot {
    startMin?: number
    endMin?: number
}

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

/** A timestamp as a time of day, "14:32". */
export function timeOfDay(ms: number): string {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Within this many minutes either way counts as on time — it's a guide, not a stopwatch. */
export const ON_TIME_MIN = 2

/** A drift in minutes (+ behind, − ahead) as "On time" / "4 min behind" / "3 min ahead". */
export function driftLabel(min: number): string {
    if (Math.abs(min) < ON_TIME_MIN) return 'On time'
    const m = Math.round(Math.abs(min))
    return min > 0 ? `${m} min behind` : `${m} min ahead`
}

export type DriftTone = 'on' | 'behind' | 'ahead'

export function driftTone(min: number): DriftTone {
    if (Math.abs(min) < ON_TIME_MIN) return 'on'
    return min > 0 ? 'behind' : 'ahead'
}

export interface Pace {
    /**
     * Per item: how far that item ran over (+) or under (−) its planned gap from
     * the previous completed item, in minutes. Null for the first completion,
     * for items not completed, and for items without a slot.
     */
    delta: (number | null)[]
    /** Where the session stands now, in minutes (+ behind). Null until two items are in. */
    drift: number | null
    /** Index of the last completed timed item, or -1. */
    last: number
    /** The next timed item not yet completed and when it's due, if any. */
    next: { index: number; dueAt: number } | null
    /** How many timed items there are, and how many are completed. */
    timed: number
    completed: number
}

/**
 * Work out the pace from each item's slot and completion time (ms), both
 * indexed by item. Items are taken in their session order; one done out of
 * order simply compares against the completed item before it.
 */
export function paceOf(slots: Slot[], completedAt: (number | null | undefined)[]): Pace {
    const delta: (number | null)[] = slots.map(() => null)
    let first = -1
    let prev = -1
    let timed = 0
    let completed = 0
    for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        if (!hasSlot(s)) continue
        timed++
        const t = completedAt[i]
        if (t == null) continue
        completed++
        if (prev !== -1) {
            const p = slots[prev] as Required<Slot>
            const actual = (t - (completedAt[prev] as number)) / 60000
            delta[i] = actual - (s.endMin - p.endMin)
        } else {
            first = i
        }
        prev = i
    }

    let drift: number | null = null
    if (first !== -1 && prev !== first) {
        const f = slots[first] as Required<Slot>
        const l = slots[prev] as Required<Slot>
        const actual = ((completedAt[prev] as number) - (completedAt[first] as number)) / 60000
        drift = actual - (l.endMin - f.endMin)
    }

    let next: Pace['next'] = null
    if (prev !== -1) {
        const l = slots[prev] as Required<Slot>
        for (let i = prev + 1; i < slots.length; i++) {
            const s = slots[i]
            if (!hasSlot(s) || completedAt[i] != null) continue
            next = {
                index: i,
                dueAt: (completedAt[prev] as number) + (s.endMin - l.endMin) * 60000,
            }
            break
        }
    }

    return { delta, drift, last: prev, next, timed, completed }
}

// ─── Device storage (conditioning) ──────────────────────────────────────────────
// A strength session keeps its completions in its log draft. A conditioning
// session has no draft, so its presses and round counts are kept here — a
// locked phone or a reload in the gym mustn't lose them.

export interface SessionTaps {
    completedAt: Record<number, number>
    counts: Record<number, number>
}

export const EMPTY_TAPS: SessionTaps = { completedAt: {}, counts: {} }

const KEY_PREFIX = 'sessionTaps:'

/** Presses from more than a day ago aren't this session any more. */
export const TAPS_TTL_MS = 24 * 60 * 60 * 1000

function readIndexed(raw: unknown): Record<number, number> {
    const out: Record<number, number> = {}
    if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const i = Number(k)
            if (Number.isInteger(i) && i >= 0 && typeof v === 'number' && Number.isFinite(v))
                out[i] = v
        }
    }
    return out
}

export function readTaps(key: string, now: number = Date.now()): SessionTaps {
    try {
        const raw = localStorage.getItem(KEY_PREFIX + key)
        if (!raw) return EMPTY_TAPS
        const parsed = JSON.parse(raw) as Record<string, unknown>
        if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > TAPS_TTL_MS)
            return EMPTY_TAPS
        return { completedAt: readIndexed(parsed.completedAt), counts: readIndexed(parsed.counts) }
    } catch {
        return EMPTY_TAPS
    }
}

export function writeTaps(key: string, taps: SessionTaps, now: number = Date.now()): void {
    try {
        localStorage.setItem(KEY_PREFIX + key, JSON.stringify({ ...taps, savedAt: now }))
    } catch {
        /* best-effort */
    }
}

export function clearTaps(key: string): void {
    try {
        localStorage.removeItem(KEY_PREFIX + key)
    } catch {
        /* best-effort */
    }
}
