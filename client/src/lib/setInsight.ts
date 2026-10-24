import type { LoggedSet, WorkoutLog } from '../types'

/**
 * Live insight while logging an exercise: how today's sets are shaping up
 * against the last time it was done. Set by set, so a session part-way through
 * is weighed against the same sets last time, not the whole of it — you
 * shouldn't look "down" just because you haven't finished yet.
 */

/** Every set from the most recent session that logged this exercise. */
export interface LastSets {
    date: string
    sets: LoggedSet[]
}

/** A set as it stands today: numbers only, blanks left out. */
export interface TodaySet {
    weight?: number
    reps?: number
}

/** Up on last time, level, or down — "mixed" when one went up and the other down. */
export type Tone = 'up' | 'same' | 'down' | 'mixed'

/** A run of words, or a number worth picking out (`{ v: '60kg' }`). */
export type InsightPart = string | { v: string }

export interface InsightLine {
    /** The sentence in pieces, so the numbers can be set apart from the words. */
    parts: InsightPart[]
    /** The same sentence as plain text. */
    text: string
    tone: Tone
}

function line(tone: Tone, ...parts: InsightPart[]): InsightLine {
    const text = parts.map((p) => (typeof p === 'string' ? p : p.v)).join('')
    return { parts, text, tone }
}

export interface SetInsight {
    /** The set being typed right now, against the same set last time. */
    current?: InsightLine
    /** Sets done against last time's count. */
    sets?: InsightLine
    /** Total work so far against the same sets last time. */
    volume?: InsightLine
}

/**
 * The most recent session that logged any sets for an exercise, matched by
 * name (logs snapshot names, not ids). `excludeId` keeps the session being
 * logged right now out of it.
 */
export function lastSetsFor(
    logs: WorkoutLog[],
    name: string,
    excludeId?: string | null
): LastSets | null {
    const want = name.trim().toLowerCase()
    const sorted = [...logs].sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)
    )
    for (const log of sorted) {
        if (log._id === excludeId) continue
        const sets = log.exercises
            .filter((ex) => ex.name.trim().toLowerCase() === want)
            .flatMap((ex) => ex.loggedSets ?? [])
            .filter((s) => s.weight != null || s.reps != null)
        if (sets.length) return { date: log.date, sets }
    }
    return null
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Drops float noise like 2.4999999. */
function tidy(n: number): number {
    return Math.round(Math.abs(n) * 100) / 100
}

/** "60kg × 8" / "60kg" / "8 reps". */
export function describeSet(s: TodaySet): string {
    if (s.weight != null && s.reps != null) return `${s.weight}kg × ${s.reps}`
    if (s.weight != null) return `${s.weight}kg`
    return plural(s.reps ?? 0, 'rep')
}

function hasNumbers(s: TodaySet): boolean {
    return s.weight != null || s.reps != null
}

/**
 * One set against the same set last time, as a sentence:
 * "Set 1: 5kg heavier but 2 fewer reps than last time's 60kg × 8".
 */
function compareSet(index: number, today: TodaySet, lastSets: LoggedSet[]): InsightLine {
    const label = `Set ${index + 1}: `
    const last = lastSets[index]
    if (!last) {
        return line('up', label, 'an extra one — last time you did ', { v: String(lastSets.length) })
    }
    const dw = today.weight != null && last.weight != null ? today.weight - last.weight : 0
    const dr = today.reps != null && last.reps != null ? today.reps - last.reps : 0
    if (dw === 0 && dr === 0) {
        // A blank weight isn't the same weight — only say "same" when both match.
        const matched =
            (today.weight != null || last.weight == null) && (today.reps != null || last.reps == null)
        return matched
            ? line('same', label, 'same as last time, ', { v: describeSet(last) })
            : line('same', label, 'last time was ', { v: describeSet(last) })
    }
    const parts: InsightPart[] = [label]
    if (dw !== 0) parts.push({ v: `${tidy(dw)}kg` }, dw > 0 ? ' heavier' : ' lighter')
    if (dw !== 0 && dr !== 0) parts.push((dw > 0) === (dr > 0) ? ' and ' : ' but ')
    if (dr !== 0) parts.push({ v: String(Math.abs(dr)) }, `${dr > 0 ? ' more' : ' fewer'} rep${Math.abs(dr) === 1 ? '' : 's'}`)
    parts.push(' than last time’s ', { v: describeSet(last) })
    const ups = (dw > 0 ? 1 : 0) + (dr > 0 ? 1 : 0)
    const downs = (dw < 0 ? 1 : 0) + (dr < 0 ? 1 : 0)
    return line(ups && downs ? 'mixed' : ups ? 'up' : 'down', ...parts)
}

/**
 * The work in some sets: weight × reps where every set has both, else reps
 * alone (bodyweight work). Null when the two sides can't be weighed the same way.
 */
function workOf(today: TodaySet[], last: LoggedSet[]): { today: number; last: number; unit: 'kg' | 'reps' } | null {
    const loaded = (s: TodaySet) => s.weight != null && s.reps != null
    if (today.every(loaded) && last.every(loaded)) {
        const sum = (xs: TodaySet[]) => xs.reduce((n, s) => n + s.weight! * s.reps!, 0)
        return { today: sum(today), last: sum(last), unit: 'kg' }
    }
    if (today.every((s) => s.reps != null) && last.every((s) => s.reps != null)) {
        const sum = (xs: TodaySet[]) => xs.reduce((n, s) => n + s.reps!, 0)
        return { today: sum(today), last: sum(last), unit: 'reps' }
    }
    return null
}

/**
 * What to say right now. `done` are the sets that count so far today, in
 * order — ticked off, or with a weight in; `current` is the set in focus.
 */
export function setInsight(
    last: LastSets | null,
    done: TodaySet[],
    current: { index: number; set: TodaySet } | null
): SetInsight {
    if (!last) return {}
    const out: SetInsight = {}
    const lastCount = last.sets.length

    if (current && hasNumbers(current.set)) {
        out.current = compareSet(current.index, current.set, last.sets)
    }

    const n = done.length
    if (n === 0) return out

    if (n > lastCount) {
        const extra = n - lastCount
        out.sets = line('up', { v: String(extra) }, ` more set${extra === 1 ? '' : 's'} than last time`)
    } else if (n === lastCount) {
        out.sets = line('same', 'Same number of sets as last time — ', { v: String(lastCount) })
    } else {
        const left = lastCount - n
        out.sets = line(
            'same',
            { v: String(left) },
            ` more set${left === 1 ? '' : 's'} to match last time’s `,
            { v: String(lastCount) }
        )
    }

    // Like for like: today's finished sets (weight and reps both in, or reps
    // for bodyweight) against the same number last time.
    const weighted = last.sets.some((s) => s.weight != null)
    const full = done.filter((s) => s.reps != null && (!weighted || s.weight != null))
    const work = full.length ? workOf(full, last.sets.slice(0, full.length)) : null
    if (work && work.last > 0) {
        const n = full.length
        const pct = Math.round(((work.today - work.last) / work.last) * 100)
        const what = work.unit === 'kg' ? 'weight' : 'reps'
        const scope: InsightPart[] =
            n >= lastCount
                ? ['last time']
                : n === 1
                  ? ['your first set last time']
                  : ['your first ', { v: String(n) }, ' sets last time']
        out.volume =
            pct === 0
                ? line('same', `Total ${what} so far matches `, ...scope)
                : line(
                      pct > 0 ? 'up' : 'down',
                      `Total ${what} so far: `,
                      { v: `${Math.abs(pct)}%` },
                      ` ${pct > 0 ? 'more' : what === 'reps' ? 'fewer' : 'less'} than `,
                      ...scope
                  )
    }
    return out
}
