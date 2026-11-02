/**
 * Sending a planned conditioning session to Garmin, against any provider and
 * any store, so it can be tested without either.
 *
 * Idempotent: a session has one Garmin workout (made once, then updated in
 * place when its steps change), and a planner entry has one placement of it on
 * the Garmin calendar (kept when it's already right, moved when the entry has
 * moved). Sending twice changes nothing on Garmin the second time.
 */
import type { IPlanEntryGarmin } from '../models/FitnessPlanEntry'
import type { ISessionPart } from '../models/ConditioningSession'
import type { Phased } from '../lib/phases'
import { buildWatchWorkout, watchStepsHash, type WatchStep, type WatchWorkout } from '../lib/watchSteps'
import { isGarminError, type GarminWorkoutProvider, type WorkoutSpec } from './provider'

export interface SyncSession extends Partial<Phased<ISessionPart>> {
    _id: string
    name: string
    /** Planned minutes. */
    duration: number
    watchSteps?: WatchStep[] | null
}

export interface SyncEntry {
    _id: string
    date: string
    garmin?: IPlanEntryGarmin | null
}

export interface SyncStore {
    getWorkout(sessionId: string): Promise<{ workoutId: string; stepsHash: string } | null>
    saveWorkout(sessionId: string, workoutId: string, stepsHash: string): Promise<void>
    saveEntry(entryId: string, garmin: IPlanEntryGarmin): Promise<void>
    /** A workout was replaced in place: every entry scheduled with it now has these steps. */
    markWorkoutEntries(workoutId: string, stepsHash: string): Promise<void>
}

export const GARMIN_STATES = ['not_sent', 'sent', 'out_of_date', 'moved'] as const
export type GarminState = (typeof GARMIN_STATES)[number]

export interface SessionPreview extends WatchWorkout {
    name: string
    hash: string
}

/** What would be sent for a session, and its fingerprint. */
export function previewSession(session: SyncSession): SessionPreview {
    const workout = buildWatchWorkout(session)
    return { ...workout, name: session.name, hash: watchStepsHash(session.name, workout.steps) }
}

/**
 * Where an entry stands: never sent; sent and current; sent but the session has
 * changed since; or sent for a day it's no longer on.
 */
export function entryGarminState(entry: SyncEntry, currentHash: string): GarminState {
    const g = entry.garmin
    if (!g?.scheduleId) return 'not_sent'
    if (g.scheduledDate !== entry.date) return 'moved'
    if (g.stepsHash !== currentHash) return 'out_of_date'
    return 'sent'
}

export interface SendResult {
    garmin: IPlanEntryGarmin
    /** Whether the workout reached the watch directly. Scheduled either way. */
    pushed: boolean
    deviceName?: string
    message: string
}

export const SCHEDULED_ONLY_MESSAGE = 'Scheduled. Sync your watch in Garmin Connect.'

export async function sendEntry(
    entry: SyncEntry,
    session: SyncSession,
    provider: GarminWorkoutProvider,
    store: SyncStore,
    now: Date = new Date()
): Promise<SendResult> {
    const preview = previewSession(session)
    const spec: WorkoutSpec = {
        name: session.name,
        steps: preview.steps,
        estimatedSeconds: Math.round((session.duration || 0) * 60),
    }

    // ── The session's one workout: reuse, update in place, or create ──────────
    let saved = await store.getWorkout(session._id)
    if (saved && saved.stepsHash !== preview.hash) {
        try {
            await provider.updateWorkout(saved.workoutId, spec)
            await store.saveWorkout(session._id, saved.workoutId, preview.hash)
            await store.markWorkoutEntries(saved.workoutId, preview.hash)
            saved = { workoutId: saved.workoutId, stepsHash: preview.hash }
        } catch (err) {
            // Deleted on Garmin's side: make it again below.
            if (!isGarminError(err, 'not_found')) throw err
            saved = null
        }
    }
    if (!saved) {
        const { workoutId } = await provider.createWorkout(spec)
        await store.saveWorkout(session._id, workoutId, preview.hash)
        saved = { workoutId, stepsHash: preview.hash }
    }
    const workoutId = saved.workoutId

    // ── This day's placement on the Garmin calendar ───────────────────────────
    const prior = entry.garmin
    let scheduleId: string
    if (prior?.scheduleId && prior.workoutId === workoutId && prior.scheduledDate === entry.date) {
        scheduleId = prior.scheduleId
    } else {
        if (prior?.scheduleId) await provider.unscheduleWorkout(prior.scheduleId)
        scheduleId = (await provider.scheduleWorkout(workoutId, entry.date)).scheduleId
    }

    const garmin: IPlanEntryGarmin = {
        workoutId,
        scheduleId,
        scheduledDate: entry.date,
        stepsHash: preview.hash,
        lastSentAt: now,
    }
    await store.saveEntry(entry._id, garmin)

    // ── Straight to the watch. Scheduling already worked, so a failure here is
    // still a success: the watch picks the workout up on its next sync. ───────
    try {
        const { deviceName } = await provider.sendToDevice(workoutId)
        return {
            garmin,
            pushed: true,
            deviceName,
            message: deviceName ? `Sent to ${deviceName}.` : 'Sent to your watch.',
        }
    } catch {
        return { garmin, pushed: false, message: SCHEDULED_ONLY_MESSAGE }
    }
}
