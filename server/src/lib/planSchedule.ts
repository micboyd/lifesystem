/**
 * Date and name-matching helpers used when a training plan is imported.
 *
 * A plan describes its training in two ways: weekday templates ("Upper A on
 * Monday") and dated sessions (a run progression whose dates live in the session
 * names, e.g. "Treadmill Week 2 - Mon 10 Aug"). Both are resolved here into
 * concrete "YYYY-MM-DD" days so the plan's schedule can be materialised once at
 * import time rather than recomputed whenever it's applied.
 */

const DAY_MS = 86_400_000

const WEEKDAYS = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
] as const

const MONTHS = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
] as const

/** "YYYY-MM-DD" → UTC epoch ms. Returns NaN for anything malformed. */
export function dayMs(date: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
    if (!m) return NaN
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** UTC epoch ms → "YYYY-MM-DD". */
export function dayKey(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday, or null when the name isn't a weekday. */
export function weekdayIndex(name: unknown): number | null {
    if (typeof name !== 'string') return null
    const key = name.trim().toLowerCase()
    if (!key) return null
    const i = WEEKDAYS.findIndex((d) => d === key || d.startsWith(key.slice(0, 3)))
    return i === -1 ? null : i
}

/**
 * Every day in [start, end] falling on `weekday` (0 = Sunday). Returns an empty
 * list when the window is invalid or inverted.
 */
export function weekdaysBetween(start: string, end: string, weekday: number): string[] {
    const from = dayMs(start)
    const to = dayMs(end)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return []
    // Walk forward from `start` to the first matching weekday, then step a week.
    const offset = (weekday - new Date(from).getUTCDay() + 7) % 7
    const out: string[] = []
    for (let ms = from + offset * DAY_MS; ms <= to; ms += 7 * DAY_MS) out.push(dayKey(ms))
    return out
}

/**
 * Pull a date out of a session name that ends with a day-and-month, optionally
 * prefixed by a weekday — "Treadmill Week 2 - Mon 10 Aug", "First Outdoor Run -
 * Wed 9 Sep". The year is inferred from the plan window: candidates outside it
 * are discarded, and when a weekday is named it must agree. Returns null when
 * the name carries no date or no candidate year fits.
 */
export function dateFromName(name: string, start: string, end: string): string | null {
    const m =
        /(?:^|[-–—:]\s*)(?:([a-z]{3,9})\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?\s*$/i.exec(
            name.trim()
        )
    if (!m) return null

    const day = Number(m[2])
    const monthKey = m[3].toLowerCase()
    const month = MONTHS.findIndex((mo) => mo.startsWith(monthKey.slice(0, 3)))
    if (month === -1 || day < 1 || day > 31) return null
    const weekday = weekdayIndex(m[1])

    const from = dayMs(start)
    const to = dayMs(end)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null

    // Try every year the window spans; prefer a candidate whose weekday agrees
    // with the name, which disambiguates a date that fits more than one year.
    const firstYear = new Date(from).getUTCFullYear()
    const lastYear = new Date(to).getUTCFullYear()
    let fallback: string | null = null
    for (let year = firstYear; year <= lastYear; year++) {
        const ms = Date.UTC(year, month, day)
        // Guard against rollover, e.g. "31 Sep" becoming 1 Oct.
        if (new Date(ms).getUTCDate() !== day) continue
        if (ms < from || ms > to) continue
        if (weekday !== null && new Date(ms).getUTCDay() === weekday) return dayKey(ms)
        fallback ??= dayKey(ms)
    }
    return fallback
}

// ─── Name matching ──────────────────────────────────────────────────────────────

/** Canonical key for name matching: trimmed, lower-cased, whitespace collapsed. */
export function nameKey(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** A library item a plan can point at, reduced to what matching needs. */
export interface NamedRef {
    id: string
    name: string
}

/**
 * Every library item named in a cell of the plan's weekly template. Cells are
 * prose rather than clean names — "Hip Mobility Flow + short ankle preparation",
 * "Pre-Run Dynamic Mobility before the run; Upper-Body and Shoulder Mobility
 * before lifting if needed" — so an exact match wins outright and otherwise any
 * library name contained in the text counts, which lets one cell name two
 * routines. A match wholly inside a longer one is dropped, so a library holding
 * both "Mobility Flow" and "Hip Mobility Flow" yields only the specific one.
 * Cells naming nothing in the library ("Optional gentle mobility only") give [].
 */
export function matchAllByName(text: unknown, refs: NamedRef[]): NamedRef[] {
    if (typeof text !== 'string') return []
    const key = nameKey(text)
    if (!key) return []

    const hits: { ref: NamedRef; key: string }[] = []
    for (const ref of refs) {
        const refKey = nameKey(ref.name)
        if (!refKey) continue
        if (refKey === key) return [ref]
        if (key.includes(refKey)) hits.push({ ref, key: refKey })
    }
    return hits
        .filter((h) => !hits.some((other) => other !== h && other.key.includes(h.key)))
        .map((h) => h.ref)
}

/** The single best library item named in `text`, or null. See `matchAllByName`. */
export function matchByName(text: unknown, refs: NamedRef[]): NamedRef | null {
    const all = matchAllByName(text, refs)
    if (all.length === 0) return null
    // Longest name wins: it's the most specific reading of the text.
    return all.reduce((best, ref) => (ref.name.length > best.name.length ? ref : best))
}
