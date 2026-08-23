import api from './api'
import type {
    ApiResponse,
    FitnessPlanEntry,
    FitnessPlanKind,
    FitnessPlanPart,
    FitnessPlanNote,
    FitnessNoteScope,
    FitnessFlagColor,
} from '../types'

/**
 * One week's planner state, as it should be put back. Entries name their library
 * item by id rather than carrying the populated document, and hold the plan that
 * placed them so restoring doesn't orphan them from it.
 */
export interface PlanWeekSnapshot {
    /** Inclusive "YYYY-MM-DD" bounds — the week's Monday and Sunday. */
    start: string
    end: string
    entries: {
        date: string
        part: FitnessPlanPart
        kind: FitnessPlanKind
        item: string
        plan: string | null
        order: number
        /** Whether its calendar clash had been accepted. */
        ignoreClash: boolean
        /** Whether its overloaded slot had been accepted. */
        ignoreOverload: boolean
    }[]
    notes: {
        scope: FitnessNoteScope
        date: string
        color: FitnessFlagColor
        label: string
    }[]
}

/**
 * Make [start, end] look exactly like the snapshot, replacing whatever is there.
 * The planner saves each change as it's made, so this is how cancelling an edit
 * puts the week back: one write, however much was changed in between.
 */
export async function restorePlanWeek(snapshot: PlanWeekSnapshot): Promise<void> {
    await api.put('/fitness-plan/week', snapshot)
}

/** List planned training whose date falls in [start, end] (inclusive, YYYY-MM-DD). */
export async function listPlanEntries(start: string, end: string): Promise<FitnessPlanEntry[]> {
    const res = await api.get<ApiResponse<FitnessPlanEntry[]>>('/fitness-plan', {
        params: { start, end },
    })
    return res.data.data
}

/** Place a workout, conditioning session or recovery item into a day's slot. */
export async function addPlanEntry(
    date: string,
    kind: FitnessPlanKind,
    item: string,
    part: FitnessPlanPart
): Promise<FitnessPlanEntry> {
    const res = await api.post<ApiResponse<FitnessPlanEntry>>('/fitness-plan', {
        date,
        kind,
        item,
        part,
    })
    return res.data.data
}

/**
 * Change a planned entry: move it to a different slot (morning / afternoon /
 * evening) of its day, accept a warning against it — a calendar clash, or the
 * overloaded slot it shares — so it stops warning, or any combination.
 */
export async function updatePlanEntry(
    id: string,
    patch: { part?: FitnessPlanPart; ignoreClash?: boolean; ignoreOverload?: boolean }
): Promise<FitnessPlanEntry> {
    const res = await api.patch<ApiResponse<FitnessPlanEntry>>(`/fitness-plan/${id}`, patch)
    return res.data.data
}

/**
 * Set the order of a day's slot. `ids` lists the slot's entries top-to-bottom;
 * each is moved into `part` at its index. Covers both reordering within a slot
 * and a drag that lands an item in a new slot at a chosen position.
 */
export async function reorderPlanSlot(
    date: string,
    part: FitnessPlanPart,
    ids: string[]
): Promise<void> {
    await api.put('/fitness-plan/reorder', { date, part, ids })
}

export async function deletePlanEntry(id: string): Promise<void> {
    await api.delete(`/fitness-plan/${id}`)
}

/**
 * Copy one week's plan onto another for the chosen categories only. Each item
 * keeps its weekday, slot and order; only the selected `kinds` in the target
 * week are overwritten. `from` and `to` are the Mondays of each week.
 */
export async function copyPlanWeek(
    from: string,
    to: string,
    kinds: FitnessPlanKind[]
): Promise<void> {
    await api.post('/fitness-plan/copy-week', { from, to, kinds })
}

/**
 * Delete every planned entry whose date falls in [start, end] (inclusive).
 * Clears a single day (start === end) or a whole week. Flags are left untouched.
 */
export async function clearPlanRange(start: string, end: string): Promise<void> {
    await api.post('/fitness-plan/clear', { start, end })
}

// ─── Day / week flag + label notes ──────────────────────────────────────────────

/** List the day/week flag notes whose date falls in [start, end] (inclusive). */
export async function listPlanNotes(start: string, end: string): Promise<FitnessPlanNote[]> {
    const res = await api.get<ApiResponse<FitnessPlanNote[]>>('/fitness-plan/notes', {
        params: { start, end },
    })
    return res.data.data
}

/**
 * Create or update the flag for one day or week. `date` is the day key for a day
 * flag, or the week's Monday for a week flag. Returns the saved note.
 */
export async function savePlanNote(
    scope: FitnessNoteScope,
    date: string,
    color: FitnessFlagColor,
    label: string
): Promise<FitnessPlanNote> {
    const res = await api.put<ApiResponse<FitnessPlanNote>>('/fitness-plan/notes', {
        scope,
        date,
        color,
        label,
    })
    return res.data.data
}

/** Remove a day or week flag. */
export async function deletePlanNote(id: string): Promise<void> {
    await api.delete(`/fitness-plan/notes/${id}`)
}
