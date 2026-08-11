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

/** A "YYYY-MM-DD" day key. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Weekday names indexed 0 = Sunday, matching `Date#getUTCDay`. */
export const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
] as const

const WEEKDAYS = WEEKDAY_NAMES.map((d) => d.toLowerCase())

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

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" day, or null when malformed. */
export function weekdayOf(date: string): number | null {
    const ms = dayMs(date)
    return Number.isFinite(ms) ? new Date(ms).getUTCDay() : null
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
 * Every day in [start, end] inclusive. Returns an empty list when the window is
 * invalid or inverted. Used to spread a dated override across a range.
 */
export function daysBetween(start: string, end: string): string[] {
    const from = dayMs(start)
    const to = dayMs(end)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return []
    const out: string[] = []
    for (let ms = from; ms <= to; ms += DAY_MS) out.push(dayKey(ms))
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

// ─── Building a schedule ────────────────────────────────────────────────────────

/** The four libraries a plan can place from. Mirrors `FitnessPlanKind`. */
export type ScheduleKind = 'workout' | 'conditioning' | 'mobility' | 'recovery'

/** Which part of the plan an entry plays. Mirrors `PlanRole`. */
export type ScheduleRole = 'strength' | 'run' | 'conditioning' | 'mobility' | 'recovery'

/** Which slot of the day an entry sits in. Mirrors `FitnessPlanPart`. */
export type SchedulePart = 'morning' | 'afternoon' | 'evening'

/**
 * Where an entry came from. Overrides distinguish the two: suppressing a
 * holiday's gym work should drop the weekly-recurring lifts but leave the dated
 * run that was written for that exact day.
 */
export type EntryOrigin = 'recurring' | 'dated'

/** One placement, with the item still held as a plain library id. */
export interface ScheduleEntry {
    date: string
    part: SchedulePart
    kind: ScheduleKind
    role: ScheduleRole
    /** The library item's id. */
    item: string
    label: string
    notes?: string
}

const PART_ORDER: SchedulePart[] = ['morning', 'afternoon', 'evening']

/** Order within a slot, so mobility is listed before the session it warms up for. */
const ROLE_ORDER: Record<ScheduleRole, number> = {
    mobility: 0,
    strength: 1,
    run: 2,
    conditioning: 3,
    recovery: 4,
}

interface BuiltEntry extends ScheduleEntry {
    origin: EntryOrigin
}

/**
 * Accumulates schedule entries, dropping repeats of the same item on a day.
 * Keyed by day + library + item so entries can be pulled back out again when a
 * dated override supersedes them.
 */
export class ScheduleBuilder {
    private byKey = new Map<string, BuiltEntry>()

    add(
        date: string,
        kind: ScheduleKind,
        role: ScheduleRole,
        ref: NamedRef,
        part: SchedulePart,
        origin: EntryOrigin,
        notes?: string
    ) {
        const key = `${date}|${kind}|${ref.id}`
        if (this.byKey.has(key)) return
        this.byKey.set(key, {
            date,
            part,
            kind,
            role,
            item: ref.id,
            label: ref.name,
            notes,
            origin,
        })
    }

    /**
     * Drop every entry of `kind` across [from, to]. `origin` narrows it to one
     * source — 'recurring' leaves explicitly dated sessions untouched. Returns
     * how many were removed, so an override can report that it did nothing.
     */
    remove(kind: ScheduleKind, from: string, to: string, origin?: EntryOrigin): number {
        let removed = 0
        for (const [key, e] of this.byKey) {
            if (e.kind !== kind || e.date < from || e.date > to) continue
            if (origin && e.origin !== origin) continue
            this.byKey.delete(key)
            removed++
        }
        return removed
    }

    /** Chronological, then by slot, then prep-before-session within a slot. */
    sorted(): ScheduleEntry[] {
        return [...this.byKey.values()]
            .sort(
                (a, b) =>
                    a.date.localeCompare(b.date) ||
                    PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part) ||
                    ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
                    a.label.localeCompare(b.label)
            )
            .map((e) => ({
                date: e.date,
                part: e.part,
                kind: e.kind,
                role: e.role,
                item: e.item,
                label: e.label,
                notes: e.notes,
            }))
    }
}

// ─── Dated overrides ────────────────────────────────────────────────────────────

/** The `suppressRecurring*` flags an override can set, and what each clears. */
const SUPPRESSIBLE = [
    { key: 'suppressRecurringStrength', kind: 'workout', label: 'strength' },
    { key: 'suppressRecurringConditioning', kind: 'conditioning', label: 'conditioning' },
    { key: 'suppressRecurringMobility', kind: 'mobility', label: 'mobility' },
    { key: 'suppressRecurringRecovery', kind: 'recovery', label: 'recovery' },
] as const satisfies readonly { key: string; kind: ScheduleKind; label: string }[]

/**
 * The categories an override can set outright, named to match the weekly
 * template's columns. Mobility and recovery fall back to each other for the same
 * reason the template does — the two libraries cross over in practice.
 */
const OVERRIDE_CELLS = [
    { key: 'strength', role: 'strength', primary: 'workout', fallback: null },
    { key: 'conditioning', role: 'conditioning', primary: 'conditioning', fallback: null },
    { key: 'mobility', role: 'mobility', primary: 'mobility', fallback: 'recovery' },
    { key: 'recovery', role: 'recovery', primary: 'recovery', fallback: 'mobility' },
] as const satisfies readonly {
    key: string
    role: ScheduleRole
    primary: ScheduleKind
    fallback: ScheduleKind | null
}[]

/** A dated exception, recorded so the plan can show what it departs from. */
export interface AppliedOverride {
    start: string
    end: string
    summary: string
    notes?: string
}

export interface OverrideResult {
    applied: AppliedOverride[]
    /** Library items an override introduced, so the plan can link them. */
    refs: { kind: ScheduleKind; role: ScheduleRole; ref: NamedRef }[]
    /** Reasons an override did nothing, for the plan's warning list. */
    problems: string[]
}

/** Default slot per kind: prep, then train, then wind down. */
export const DEFAULT_PART: Record<ScheduleKind, SchedulePart> = {
    mobility: 'morning',
    workout: 'morning',
    conditioning: 'afternoon',
    recovery: 'evening',
}

/**
 * Apply dated exceptions on top of a built schedule — a holiday with no gym
 * access, a match day that replaces the usual session, a deload week.
 *
 * Each row covers one `date` or a `start`–`end` range, and does two kinds of
 * thing. `suppressRecurring*` drops only the weekly-recurring items, so the run
 * written for that exact day survives a week with no gym. Naming a category
 * outright (`"strength": "Match Day Prep"`) replaces everything of that category
 * on those days, and `null` clears it — the distinction that matters is between
 * a key being absent (leave the day alone) and present-but-null (empty it).
 *
 * Rows are applied in order, so a later one wins over an earlier one covering
 * the same days.
 */
export function applyOverrides(
    schedule: ScheduleBuilder,
    rows: Record<string, unknown>[],
    libraries: Record<ScheduleKind, NamedRef[]>,
    part: (raw: unknown, kind: ScheduleKind) => SchedulePart = (raw, kind) =>
        PART_ORDER.includes(raw as SchedulePart) ? (raw as SchedulePart) : DEFAULT_PART[kind]
): OverrideResult {
    const applied: AppliedOverride[] = []
    const refs: OverrideResult['refs'] = []
    const problems: string[] = []

    rows.forEach((row, i) => {
        const label = `Override ${i + 1}`
        const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
        const single = text(row.date)
        const from = single ?? text(row.start)
        const to = single ?? text(row.end) ?? from
        if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
            problems.push(`${label}: needs a "date", or a "start" and "end" in "YYYY-MM-DD" form.`)
            return
        }
        if (dayMs(to) < dayMs(from)) {
            problems.push(`${label}: "end" (${to}) is before "start" (${from}).`)
            return
        }

        const notes = text(row.notes)
        const summary: string[] = []

        for (const { key, kind, label: kindLabel } of SUPPRESSIBLE) {
            if (row[key] !== true && row.suppressRecurring !== true) continue
            const removed = schedule.remove(kind, from, to, 'recurring')
            summary.push(`no recurring ${kindLabel}${removed === 0 ? ' (nothing to drop)' : ''}`)
        }

        // Whether any category key was present at all, so an override that named
        // something unresolvable isn't also reported as saying nothing.
        let attempted = false

        for (const { key, role, primary, fallback } of OVERRIDE_CELLS) {
            // Absent means "leave this category alone"; present-but-null empties it.
            if (!(key in row)) continue
            attempted = true
            const value = row[key]

            if (value === null) {
                schedule.remove(primary, from, to)
                if (fallback) schedule.remove(fallback, from, to)
                summary.push(`no ${key}`)
                continue
            }

            // Resolve before clearing. A typo shouldn't quietly empty the day —
            // leaving it untouched and warning is far easier to notice and fix.
            const hits = matchAllByName(value, libraries[primary])
            const kind = hits.length || !fallback ? primary : fallback
            const found = hits.length
                ? hits
                : fallback
                  ? matchAllByName(value, libraries[fallback])
                  : []
            if (found.length === 0) {
                problems.push(
                    `${label}: nothing in your ${key} library matches "${String(value)}", so ${from} was left as it was.`
                )
                continue
            }

            schedule.remove(primary, from, to)
            if (fallback) schedule.remove(fallback, from, to)
            for (const date of daysBetween(from, to)) {
                for (const ref of found) {
                    schedule.add(date, kind, role, ref, part(row.part, kind), 'dated', notes)
                }
            }
            for (const ref of found) refs.push({ kind, role, ref })
            summary.push(`${key}: ${found.map((r) => r.name).join(', ')}`)
        }

        if (summary.length === 0) {
            if (!attempted) {
                problems.push(`${label}: nothing to change — no category or suppression was set.`)
            }
            return
        }
        applied.push({ start: from, end: to, summary: summary.join('; '), notes })
    })

    return { applied, refs, problems }
}
