/**
 * Reps inside a conditioning section — the one structure every section uses.
 *
 * A section (a "part" in a phase) is a list of reps, and a rep says what you do
 * in plain fields rather than prose: what it is ("Run", "Bike", "Calf raises"),
 * how long or how far, and how hard (speed, pace, incline, effort), plus an
 * optional recovery after it. `times` repeats a rep, so "5 × 400 m run, 150 m
 * walk" is one entry, not five.
 *
 * Generic on purpose: a treadmill run, a bike sprint, a rower piece, a walk and a
 * set of calf raises all fit the same handful of fields, and the app shows the
 * same rows for all of them.
 *
 * Older plans wrote the same thing three other ways — `rounds` + `roundDetails`,
 * a `steps` sub-list, or prose in `detail`. `legacyReps` turns the first two
 * into reps so they show the same way; prose stays as the section's note.
 */

/** One thing done for a stretch of time or distance. */
export interface IRepEffort {
    /** What it is: "Run", "Walk", "Bike", "Row", "Calf raises", "Hold". */
    do: string
    /** How long, in seconds. */
    seconds?: number
    /** How far, in metres. */
    metres?: number
    /** How many — for a movement done for a count, e.g. 15 calf raises. */
    count?: number
    /** Treadmill / bike speed as written, e.g. "7.0 km/h". */
    speed?: string
    /** Pace as written, e.g. "8:30/km". */
    pace?: string
    /** Incline as written, e.g. "1%". */
    incline?: string
    /** How hard, as written: "Easy", "Zone 2", "RPE 7", "200 W". */
    effort?: string
    /** Anything else worth knowing, e.g. "each side". */
    note?: string
}

/** One rep: the work, then an optional recovery. */
export interface ISessionRep extends IRepEffort {
    rest?: IRepEffort
}

/** Longest list kept once `times` is unrolled. */
export const MAX_REPS = 100

function str(v: unknown): string | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    return typeof v === 'string' ? v.trim() || undefined : undefined
}

function first(o: Record<string, unknown>, keys: string[]): unknown {
    for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
    return undefined
}

/**
 * A duration → seconds. Numbers are seconds; strings take "90s", "90 sec",
 * "2 min", "2.5 mins", "1:30", "1h", "1 h 20 min".
 */
export function parseDuration(v: unknown): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
    if (typeof v !== 'string') return undefined
    const s = v.trim().toLowerCase()
    if (!s) return undefined
    const colon = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(s)
    if (colon) {
        const [, a, b, c] = colon
        const total = c !== undefined ? +a * 3600 + +b * 60 + +c : +a * 60 + +b
        return total > 0 ? total : undefined
    }
    let total = 0
    let matched = false
    const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m(?!e|i)|seconds?|secs?|s)\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) {
        matched = true
        const n = Number(m[1])
        const unit = m[2]
        total += unit.startsWith('h') ? n * 3600 : unit.startsWith('m') ? n * 60 : n
    }
    if (!matched) {
        // A bare number in a string is seconds, like a bare number.
        const n = /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN
        return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
    }
    return total > 0 ? Math.round(total) : undefined
}

/**
 * A distance → metres. Numbers are metres; strings take "400 m", "400m",
 * "1.5 km", "1 mile", "2 miles".
 */
export function parseDistance(v: unknown): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
    if (typeof v !== 'string') return undefined
    const m = /^(\d+(?:\.\d+)?)\s*(km|kms|kilometres?|kilometers?|m|metres?|meters?|mi|miles?)?$/i.exec(
        v.trim()
    )
    if (!m) return undefined
    const n = Number(m[1])
    const unit = (m[2] ?? 'm').toLowerCase()
    const metres = unit.startsWith('k') ? n * 1000 : unit.startsWith('mi') ? n * 1609.344 : n
    return metres > 0 ? Math.round(metres) : undefined
}

/** The effort fields of one raw object, under their names or the usual aliases. */
function readEffort(o: Record<string, unknown>, fallbackDo: string): IRepEffort | undefined {
    const what = str(first(o, ['do', 'what', 'name', 'activity', 'label']))
    const seconds = parseDuration(first(o, ['time', 'duration', 'seconds']))
    const metres = parseDistance(first(o, ['distance', 'metres', 'meters']))
    const countRaw = first(o, ['count', 'reps'])
    const count =
        typeof countRaw === 'number' && Number.isFinite(countRaw) && countRaw > 0
            ? Math.round(countRaw)
            : typeof countRaw === 'string' && /^\d+$/.test(countRaw.trim())
              ? Number(countRaw.trim())
              : undefined
    const effort: IRepEffort = {
        do: what ?? fallbackDo,
        ...(seconds ? { seconds } : {}),
        ...(metres ? { metres } : {}),
        ...(count ? { count } : {}),
    }
    const speed = str(o.speed)
    const pace = str(o.pace)
    const incline = str(first(o, ['incline', 'gradient']))
    const how = str(first(o, ['effort', 'intensity', 'zone', 'rpe']))
    const note = str(first(o, ['note', 'notes', 'cue']))
    if (speed) effort.speed = speed
    if (pace) effort.pace = pace
    if (incline) effort.incline = incline
    if (how) effort.effort = how
    if (note) effort.note = note
    // Nothing at all written: not a rep.
    if (!what && Object.keys(effort).length === 1) return undefined
    return effort
}

/** A rest written as a string: "60s" is standing rest, anything else is what to do. */
function readRest(raw: unknown): IRepEffort | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    if (typeof raw === 'number' || typeof raw === 'string') {
        const seconds = parseDuration(raw)
        if (seconds) return { do: 'Rest', seconds }
        const text = str(raw)
        return text ? { do: text } : undefined
    }
    if (typeof raw === 'object') return readEffort(raw as Record<string, unknown>, 'Rest')
    return undefined
}

/**
 * A section's `reps`, unrolled (`times` → that many copies) and capped at
 * MAX_REPS. Undefined when there are none. A bare string is a rep with only a
 * `do`, so ["Leg swings ×10", "Lunges ×10"] works for a list of drills.
 */
export function readReps(raw: unknown): ISessionRep[] | undefined {
    if (!Array.isArray(raw)) return undefined
    const out: ISessionRep[] = []
    for (const item of raw) {
        if (out.length >= MAX_REPS) break
        let rep: ISessionRep | undefined
        let times = 1
        if (typeof item === 'string') {
            const text = item.trim()
            if (text) rep = { do: text }
        } else if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>
            const effort = readEffort(o, 'Rep')
            if (effort) {
                const rest = readRest(first(o, ['rest', 'recovery', 'then']))
                rep = rest ? { ...effort, rest } : effort
            }
            const t = first(o, ['times', 'repeat', 'x'])
            const n = typeof t === 'number' ? Math.floor(t) : typeof t === 'string' ? parseInt(t, 10) : 1
            times = Number.isFinite(n) && n >= 1 ? n : 1
        }
        if (!rep) continue
        for (let i = 0; i < times && out.length < MAX_REPS; i++) out.push({ ...rep })
    }
    return out.length ? out : undefined
}

/**
 * Reps for a section written the older ways: `rounds` (with any
 * `roundDetails`) become that many reps; a `steps` sub-list becomes one rep per
 * step. Undefined when neither is there.
 */
export function legacyReps(part: {
    rounds?: number
    roundLabel?: string
    roundDetails?: string[]
    steps?: string[]
}): ISessionRep[] | undefined {
    if (part.rounds && part.rounds >= 1) {
        const label = part.roundLabel?.trim() || 'Rep'
        const name = label.charAt(0).toUpperCase() + label.slice(1)
        return Array.from({ length: Math.min(part.rounds, MAX_REPS) }, (_, i) => ({
            do: part.roundDetails?.[i]?.trim() || `${name} ${i + 1}`,
        }))
    }
    if (part.steps?.length) return part.steps.map((s) => ({ do: s }))
    return undefined
}

/** 45 → "45 s", 90 → "90 s", 120 → "2 min", 150 → "2:30", 3600 → "60 min". */
export function formatSeconds(sec: number): string {
    if (sec % 60 === 0) return `${sec / 60} min`
    if (sec < 120) return `${sec} s`
    const m = Math.floor(sec / 60)
    return `${m}:${String(sec % 60).padStart(2, '0')}`
}

/** 400 → "400 m", 1500 → "1.5 km". */
export function formatMetres(m: number): string {
    return m >= 1000 ? `${Math.round(m / 10) / 100} km` : `${m} m`
}

/** One effort as a line: "Run 400 m · 8:30/km". */
export function effortLine(e: IRepEffort): string {
    const facts = [
        e.count ? `×${e.count}` : undefined,
        e.metres ? formatMetres(e.metres) : undefined,
        e.seconds ? formatSeconds(e.seconds) : undefined,
    ].filter(Boolean)
    const how = [e.speed, e.pace, e.incline ? `${e.incline} incline` : undefined, e.effort, e.note].filter(
        Boolean
    )
    return [`${e.do}${facts.length ? ` ${facts.join(' ')}` : ''}`, ...how].join(' · ')
}

/** A whole rep as a line: "Run 400 m · 8:30/km, then Walk 150 m". */
export function repLine(rep: ISessionRep): string {
    const work = effortLine(rep)
    return rep.rest ? `${work}, then ${effortLine(rep.rest).replace(/^\w/, (c) => c.toLowerCase())}` : work
}

/** Seconds a rep takes, rest included — undefined unless every piece is timed. */
export function repSeconds(rep: ISessionRep): number | undefined {
    if (!rep.seconds) return undefined
    if (!rep.rest) return rep.seconds
    return rep.rest.seconds ? rep.seconds + rep.rest.seconds : undefined
}

/** One effort in the import format: "400 m", "90 s", as a person would write it. */
function effortOut(e: IRepEffort): Record<string, unknown> {
    return {
        do: e.do,
        ...(e.seconds ? { time: formatSeconds(e.seconds) } : {}),
        ...(e.metres ? { distance: formatMetres(e.metres) } : {}),
        ...(e.count ? { count: e.count } : {}),
        ...(e.speed ? { speed: e.speed } : {}),
        ...(e.pace ? { pace: e.pace } : {}),
        ...(e.incline ? { incline: e.incline } : {}),
        ...(e.effort ? { effort: e.effort } : {}),
        ...(e.note ? { note: e.note } : {}),
    }
}

/**
 * Reps back in the import format, runs of identical reps folded into one entry
 * with `times` — so an export pastes straight back in.
 */
export function repsForExport(reps: ISessionRep[]): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = []
    let i = 0
    while (i < reps.length) {
        const key = JSON.stringify(reps[i])
        let n = 1
        while (i + n < reps.length && JSON.stringify(reps[i + n]) === key) n++
        const rep = reps[i]
        out.push({
            ...(n > 1 ? { times: n } : {}),
            ...effortOut(rep),
            ...(rep.rest ? { rest: effortOut(rep.rest) } : {}),
        })
        i += n
    }
    return out
}
