import { useCallback, useEffect, useRef, useState } from 'react'
import type { Checkpoint, ConditioningSession, RoundProgress } from '../types'
import { allInPhases } from '../lib/phases'
import { hasSlot, readTaps, writeTaps, clearTaps, EMPTY_TAPS, type SessionTaps } from '../lib/sessionPace'
import { createLog, updateLog, type ConditioningLogInput } from '../services/conditioningLogs'
import type { SaveState } from './SessionPace'

/** How long after the last press the session is saved — presses come in bursts. */
const AUTOSAVE_MS = 1200

/**
 * The log fields for a session as it stands: the rounds tapped on each counted
 * part, each part's slot against when it was completed, and — once two parts
 * are in — how long it actually took.
 */
export function conditioningPayload(
    session: ConditioningSession,
    date: string,
    taps: SessionTaps
): ConditioningLogInput {
    const parts = allInPhases(session)
    const rounds: RoundProgress[] = parts
        .map((part, i) =>
            part.rounds ? { name: part.name, done: taps.counts[i] ?? 0, target: part.rounds } : null
        )
        .filter((r): r is RoundProgress => r !== null)
    const pressed = Object.keys(taps.completedAt).length > 0
    const checkpoints: Checkpoint[] | undefined = pressed
        ? parts.map((part, i) => ({
              name: part.name,
              ...(part.startMin !== undefined ? { startMin: part.startMin } : {}),
              ...(part.endMin !== undefined ? { endMin: part.endMin } : {}),
              ...(taps.completedAt[i] !== undefined
                  ? { completedAt: new Date(taps.completedAt[i]).toISOString() }
                  : {}),
          }))
        : undefined

    // Actual time: first press to last, plus the first part itself (its press
    // marks its end, not its start). Falls back to the planned duration.
    let duration = session.duration
    const done = Object.entries(taps.completedAt)
        .map(([k, t]) => ({ i: Number(k), t }))
        .sort((a, b) => a.t - b.t)
    if (done.length >= 2) {
        const firstPart = parts[done[0].i]
        const firstLen =
            firstPart && hasSlot(firstPart) ? firstPart.endMin - firstPart.startMin : 0
        duration = Math.max(
            1,
            Math.round((done[done.length - 1].t - done[0].t) / 60000 + firstLen)
        )
    }

    return {
        session: session._id,
        date,
        duration,
        rounds: rounds.length > 0 ? rounds : undefined,
        checkpoints,
    }
}

/**
 * Logging a planned conditioning session in the gym. Presses and round counts
 * land on the device straight away, then save to the log a moment later — the
 * first save creates it (which ticks the session off in the planner), every
 * later one updates it. A failed save is retried on the next change, and the
 * device copy means nothing is lost meanwhile.
 */
export function useConditioningLog({
    entryId,
    session,
    date,
    existingLogId,
    onCreated,
}: {
    /** The plan entry being logged, or null when none is open. */
    entryId: string | null
    session: ConditioningSession | null
    date: string
    /** The log already written for this entry, if any. */
    existingLogId: string | null
    onCreated: (logId: string) => void
}) {
    const [taps, setTaps] = useState<SessionTaps>(() =>
        entryId ? readTaps(entryId) : EMPTY_TAPS
    )
    const [logId, setLogId] = useState<string | null>(existingLogId)
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const [savedAt, setSavedAt] = useState<number | null>(null)
    const [pending, setPending] = useState(0)
    const saving = useRef(false)
    // A change that landed while a save was in flight — save again after it.
    const again = useRef(false)
    // Read through a ref so a new callback each render doesn't restart the timer.
    const created = useRef(onCreated)
    useEffect(() => {
        created.current = onCreated
    }, [onCreated])

    // A different entry: pick up whatever this device has for it.
    useEffect(() => {
        setTaps(entryId ? readTaps(entryId) : EMPTY_TAPS)
        setLogId(existingLogId)
        setSaveState('idle')
        setSavedAt(null)
        setPending(0)
        // Only on a new entry — existingLogId catching up is handled below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entryId])

    // The planner learning about a log (or losing it) after the drawer opened.
    useEffect(() => {
        setLogId(existingLogId)
    }, [existingLogId])

    const change = useCallback(
        (fn: (prev: SessionTaps) => SessionTaps) => {
            if (!entryId) return
            setTaps((prev) => {
                const next = fn(prev)
                writeTaps(entryId, next)
                return next
            })
            setSaveState((s) => (s === 'error' ? s : 'local'))
            setPending((n) => n + 1)
        },
        [entryId]
    )

    /** Save the session as it stands. Resolves false when the save failed. */
    const save = useCallback(async (): Promise<boolean> => {
        if (!session) return false
        if (saving.current) {
            // The save in flight will be followed by another with this change.
            again.current = true
            return true
        }
        saving.current = true
        setSaveState('saving')
        try {
            const fields = conditioningPayload(session, date, taps)
            if (logId) {
                await updateLog(logId, fields)
            } else {
                const log = await createLog(fields)
                setLogId(log._id)
                created.current(log._id)
            }
            setSaveState('saved')
            setSavedAt(Date.now())
            return true
        } catch {
            setSaveState('error')
            return false
        } finally {
            saving.current = false
            if (again.current) {
                again.current = false
                setPending((n) => n + 1)
            }
        }
    }, [session, date, taps, logId])

    // Autosave a beat after the last change.
    useEffect(() => {
        if (pending === 0) return
        const timer = setTimeout(save, AUTOSAVE_MS)
        return () => clearTimeout(timer)
    }, [pending, save])

    return {
        taps,
        logId,
        saveState,
        savedAt,
        complete: (i: number) =>
            change((p) => ({ ...p, completedAt: { ...p.completedAt, [i]: Date.now() } })),
        undo: (i: number) =>
            change((p) => {
                const completedAt = { ...p.completedAt }
                delete completedAt[i]
                return { ...p, completedAt }
            }),
        count: (i: number, n: number) => change((p) => ({ ...p, counts: { ...p.counts, [i]: n } })),
        /** Save now, e.g. from "Mark as done". */
        saveNow: save,
        /** Forget this device's presses — the log they were saved to is gone. */
        forget: () => {
            if (entryId) clearTaps(entryId)
            setTaps(EMPTY_TAPS)
            setPending(0)
            setSaveState('idle')
        },
    }
}
