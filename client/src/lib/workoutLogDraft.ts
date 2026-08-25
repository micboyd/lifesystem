/**
 * A half-finished strength log, kept on the device.
 *
 * You fill a log in over an hour in the gym — a set at a time, between lifts —
 * and until now none of it existed anywhere until the final save. A locked
 * phone, a reload or a mis-tapped Cancel took the whole session with it. The
 * drawer autosaves what you've typed here instead, and picks it back up when
 * you reopen the same workout.
 *
 * Device-local on purpose: an unfinished log isn't history yet, so it has no
 * business in the log list, in volume totals or in trends until you save it.
 */

/** A set as typed — strings, so a half-entered row survives a reload. */
export interface DraftSet {
    weight: string
    reps: string
}

/** One exercise row of the draft, mirroring the drawer's editing state. */
export interface DraftExercise {
    exerciseId: string
    name: string
    swappedFrom?: { id: string; name: string }
    prescription: string
    sets: DraftSet[]
    /** Skipped in this session — kept in place so indices stay aligned. */
    removed?: boolean
}

export interface WorkoutLogDraft {
    /** The workout's exercise line-up when the draft started — see `draftSignature`. */
    signature: string
    date: string
    notes: string
    exercises: DraftExercise[]
    /** ms since epoch of the last write. */
    savedAt: number
}

const KEY_PREFIX = 'workoutLogDraft:'

/**
 * How long an unfinished log stays around. A session runs long — and can be
 * picked up after dinner — but a draft from last week reopening itself on top
 * of today's workout would be worse than losing it.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

function keyFor(workoutId: string): string {
    return `${KEY_PREFIX}${workoutId}`
}

/**
 * Identify the workout's line-up, so a draft can't be restored onto a workout
 * that's been re-ordered or had exercises added since — the rows would no
 * longer mean what they meant when they were typed.
 */
export function draftSignature(exerciseIds: readonly string[]): string {
    return exerciseIds.join(',')
}

function readSets(raw: unknown): DraftSet[] | null {
    if (!Array.isArray(raw)) return null
    const sets: DraftSet[] = []
    for (const s of raw) {
        if (!s || typeof s !== 'object') return null
        const { weight, reps } = s as Record<string, unknown>
        if (typeof weight !== 'string' || typeof reps !== 'string') return null
        sets.push({ weight, reps })
    }
    return sets
}

function readExercises(raw: unknown): DraftExercise[] | null {
    if (!Array.isArray(raw)) return null
    const rows: DraftExercise[] = []
    for (const e of raw) {
        if (!e || typeof e !== 'object') return null
        const { exerciseId, name, prescription, swappedFrom, removed } = e as Record<
            string,
            unknown
        >
        const sets = readSets((e as Record<string, unknown>).sets)
        if (typeof exerciseId !== 'string' || typeof name !== 'string' || !sets) return null
        const origin =
            swappedFrom && typeof swappedFrom === 'object'
                ? (swappedFrom as Record<string, unknown>)
                : null
        rows.push({
            exerciseId,
            name,
            prescription: typeof prescription === 'string' ? prescription : '',
            sets,
            ...(origin && typeof origin.id === 'string' && typeof origin.name === 'string'
                ? { swappedFrom: { id: origin.id, name: origin.name } }
                : {}),
            ...(removed === true ? { removed: true } : {}),
        })
    }
    return rows
}

/**
 * The draft for this workout, or null when there isn't a usable one: nothing
 * saved, unreadable, stale, or seeded from a different line-up.
 */
export function readDraft(
    workoutId: string,
    signature: string,
    now: number = Date.now()
): WorkoutLogDraft | null {
    try {
        const raw = localStorage.getItem(keyFor(workoutId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const exercises = readExercises(parsed.exercises)
        if (!exercises) return null
        if (parsed.signature !== signature) return null
        if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > DRAFT_TTL_MS) return null
        if (typeof parsed.date !== 'string') return null
        return {
            signature,
            date: parsed.date,
            notes: typeof parsed.notes === 'string' ? parsed.notes : '',
            exercises,
            savedAt: parsed.savedAt,
        }
    } catch {
        return null
    }
}

/** Persist the draft, stamping it with the time. Best-effort. */
export function writeDraft(
    workoutId: string,
    draft: Omit<WorkoutLogDraft, 'savedAt'>,
    now: number = Date.now()
): void {
    try {
        localStorage.setItem(keyFor(workoutId), JSON.stringify({ ...draft, savedAt: now }))
    } catch {
        /* persistence is best-effort (private mode, blocked storage, quota) */
    }
}

/** Drop the draft — the log was saved, or the user threw it away. */
export function clearDraft(workoutId: string): void {
    try {
        localStorage.removeItem(keyFor(workoutId))
    } catch {
        /* best-effort */
    }
}

/** "just now" / "12 minutes ago" / "2 hours ago" — for the restored-draft note. */
export function describeAge(savedAt: number, now: number = Date.now()): string {
    const mins = Math.floor(Math.max(0, now - savedAt) / 60000)
    if (mins < 1) return 'just now'
    if (mins === 1) return '1 minute ago'
    if (mins < 60) return `${mins} minutes ago`
    const hours = Math.round(mins / 60)
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}
