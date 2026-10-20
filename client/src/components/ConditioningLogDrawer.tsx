import { useEffect, useRef, useState } from 'react'
import Drawer from './Drawer'
import Button from './Button'
import DatePicker from './DatePicker'
import Textarea from './Textarea'
import ConditioningSessionDetail from './ConditioningSessionDetail'
import { SaveStatus } from './SessionPace'
import { useStepTicks } from './session/SessionUI'
import { SummaryExerciseList, SummaryStats, type SummaryRow } from './session/WorkoutSummary'
import { conditioningPayload, useConditioningLog } from './useConditioningLog'
import { useToast } from '../context/ToastContext'
import { todayKey } from '../lib/calendar'
import { flattenPhases } from '../lib/phases'
import {
    driftLabel,
    driftTone,
    paceOf,
    readTaps,
    timeOfDay,
    type DriftTone,
} from '../lib/sessionPace'
import type { ConditioningSession } from '../types'

const DELTA_TONE: Record<DriftTone, string> = {
    on: 'bg-emerald-50 text-emerald-700',
    behind: 'bg-amber-50 text-amber-700',
    ahead: 'bg-sky-50 text-sky-700',
}

/** A conditioning session to log, and where it's kept. */
export interface ConditioningLogTarget {
    session: ConditioningSession
    /** YYYY-MM-DD the session is logged to. */
    date: string
    /** Where the presses are kept on the device. */
    tapsKey: string
    /** Where the sub-list step ticks are kept on the device. */
    stepsKey: string
    /** The log already written for it, when picking a session back up. */
    existingLogId: string | null
    /** That log's notes, so the wrap-up starts from them. */
    notes?: string
}

/**
 * Logging a conditioning session: one screen with the whole session — each
 * part's Completed button, round counters and sub-lists, with the pace on top —
 * then a wrap-up with what was done, notes, the date, and Finish. Opened from a
 * planned session's overview or the Session Library.
 *
 * Every press lands on the device and autosaves a moment later (the first save
 * creates the log, ticking the session off); Finish saves once more and closes.
 */
export default function ConditioningLogDrawer({
    target,
    onClose,
    onLogged,
}: {
    target: ConditioningLogTarget | null
    onClose: () => void
    /** A log was written for the session (its first save, or Finish) — on this day. */
    onLogged?: (logId: string, date: string) => void
}) {
    const toast = useToast()
    // Retain the last target while the drawer animates closed.
    const [view, setView] = useState<ConditioningLogTarget | null>(target)
    const [step, setStep] = useState<'log' | 'wrap'>('log')
    const [date, setDate] = useState(target?.date ?? todayKey())
    /** Undefined until edited, so autosaves leave the log's notes alone. */
    const [notes, setNotes] = useState<string | undefined>(undefined)
    const [finishing, setFinishing] = useState(false)
    const top = useRef<HTMLDivElement>(null)

    // A new session opening: start on the session, or on the wrap-up when every
    // part was already completed on this device.
    if (target && target !== view) {
        const parts = flattenPhases(target.session).length
        const done = Object.keys(readTaps(target.tapsKey).completedAt).length
        setView(target)
        setStep(parts > 0 && done >= parts ? 'wrap' : 'log')
        setDate(target.date)
        setNotes(undefined)
    }

    const session = view?.session ?? null
    const logger = useConditioningLog({
        entryId: target ? target.tapsKey : null,
        session: target ? session : null,
        date,
        existingLogId: view?.existingLogId ?? null,
        notes,
        onCreated: (logId) => onLogged?.(logId, date),
    })
    const steps = useStepTicks(view ? view.stepsKey : null)

    useEffect(() => {
        top.current?.scrollIntoView({ block: 'start' })
    }, [step])

    async function finish() {
        if (!session) return
        setFinishing(true)
        try {
            if (!(await logger.saveNow())) throw new Error('save failed')
            if (logger.logId) onLogged?.(logger.logId, date)
            toast.show(`Logged “${session.name}”.`, 'success')
            onClose()
        } catch {
            toast.show('Could not save that — please try again.', 'danger')
        } finally {
            setFinishing(false)
        }
    }

    return (
        <Drawer
            open={!!target}
            onClose={onClose}
            size="2xl"
            title={session?.name ?? 'Log session'}
            footer={
                <div className="flex w-full items-center gap-3">
                    <div className="mr-auto min-w-0">
                        <SaveStatus state={logger.saveState} savedAt={logger.savedAt} />
                    </div>
                    {step === 'wrap' ? (
                        <>
                            <Button
                                variant="secondary"
                                icon="fa-solid fa-arrow-left"
                                onClick={() => setStep('log')}
                                aria-label="Back to the session"
                            >
                                <span className="hidden sm:inline">Back</span>
                            </Button>
                            <Button
                                icon="fa-solid fa-flag-checkered"
                                onClick={finish}
                                disabled={finishing}
                            >
                                {finishing ? 'Saving…' : 'Finish session'}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => setStep('wrap')}>
                            Wrap up
                            <i className="fa-solid fa-arrow-right ml-2 text-xs" aria-hidden="true" />
                        </Button>
                    )}
                </div>
            }
        >
            {session && (
                <div ref={top} className="scroll-mt-5">
                    {step === 'log' ? (
                        <ConditioningSessionDetail
                            session={session}
                            counts={logger.taps.counts}
                            onCount={(i, n) => {
                                logger.count(i, n)
                                // The last rep finishes the part — no separate
                                // Completed press needed.
                                const target = flattenPhases(session)[i]?.item.rounds ?? 0
                                if (target > 0 && n >= target && logger.taps.completedAt[i] == null)
                                    logger.complete(i)
                            }}
                            completedAt={logger.taps.completedAt}
                            onComplete={logger.complete}
                            onUndo={logger.undo}
                            stepTicks={steps.ticks}
                            onToggleStep={steps.toggle}
                        />
                    ) : (
                        <WrapUp
                            session={session}
                            completedAt={logger.taps.completedAt}
                            counts={logger.taps.counts}
                            duration={conditioningPayload(session, date, logger.taps).duration ?? 0}
                            notes={notes ?? view?.notes ?? ''}
                            date={date}
                            onNotes={(v) => {
                                setNotes(v)
                                logger.touch()
                            }}
                            onDate={(v) => {
                                setDate(v)
                                logger.touch()
                            }}
                            onBack={() => setStep('log')}
                        />
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Wrap-up ────────────────────────────────────────────────────────────────────

function WrapUp({
    session,
    completedAt,
    counts,
    duration,
    notes,
    date,
    onNotes,
    onDate,
    onBack,
}: {
    session: ConditioningSession
    completedAt: Record<number, number>
    counts: Record<number, number>
    duration: number
    notes: string
    date: string
    onNotes: (v: string) => void
    onDate: (v: string) => void
    onBack: () => void
}) {
    return (
        <div className="flex flex-col gap-7">
            <header>
                <h3 className="text-2xl font-semibold tracking-[-0.02em] text-neutral-900">
                    Wrap up
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                    Check it over, add a note, and finish.
                </p>
            </header>

            <ConditioningSummary
                session={session}
                completedAt={completedAt}
                counts={counts}
                duration={duration}
                onPartClick={onBack}
            />

            <Textarea
                label="Notes"
                rows={3}
                placeholder="How did it go? Anything to remember for next time…"
                value={notes}
                onChange={(e) => onNotes(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-neutral-700">Date</label>
                <DatePicker
                    value={date}
                    maxDate={todayKey()}
                    onChange={(v) => onDate(typeof v === 'string' ? v : todayKey())}
                />
            </div>
        </div>
    )
}

// ─── Summary ────────────────────────────────────────────────────────────────────

/**
 * A session's totals, pace and parts as done — the wrap-up's read-out, and the
 * same layout a finished session shows in the planner and the Sessions log.
 */
export function ConditioningSummary({
    session,
    completedAt,
    counts,
    duration,
    allDone = false,
    onPartClick,
}: {
    session: ConditioningSession
    /** When each part was completed (ms), by its index across the phases. */
    completedAt: Record<number, number>
    counts: Record<number, number>
    duration: number
    /** Logged without part times (a quick "Mark as done") — every part counts as done. */
    allDone?: boolean
    /** Makes each part a button, e.g. back to it in the logger. */
    onPartClick?: () => void
}) {
    const parts = flattenPhases(session)
    const times = parts.map((_, i) => completedAt[i] ?? null)
    const pace = paceOf(
        parts.map(({ item }) => ({ startMin: item.startMin, endMin: item.endMin })),
        times
    )
    const partsDone = allDone ? parts.length : times.filter((t) => t !== null).length
    const counted = parts.filter(({ item }) => item.rounds)
    const roundsDone = parts.reduce(
        (n, { item }, i) => n + (item.rounds ? Math.min(counts[i] ?? 0, item.rounds) : 0),
        0
    )
    const roundsTarget = counted.reduce((n, { item }) => n + (item.rounds ?? 0), 0)

    const rows: SummaryRow[] = parts.map(({ phase, item }, i) => {
        const t = times[i]
        const delta = pace.delta[i]
        const chips = [
            ...(item.rounds ? [`${counts[i] ?? 0}/${item.rounds} ${item.roundLabel || 'rounds'}`] : []),
            ...(t !== null ? [timeOfDay(t)] : []),
            ...(t !== null && delta != null ? [driftLabel(delta)] : []),
        ]
        return {
            key: i,
            name: item.name,
            phase,
            progress: t !== null || allDone ? 'all' : counts[i] ? 'some' : 'none',
            sets: chips,
            detail: allDone ? 'Done' : 'Not completed',
            onClick: onPartClick,
        }
    })

    return (
        <>
            <SummaryStats
                items={[
                    { label: 'Time', value: duration, unit: 'min' },
                    { label: 'Parts', value: `${partsDone}/${parts.length}` },
                    ...(roundsTarget > 0
                        ? [{ label: 'Rounds', value: `${roundsDone}/${roundsTarget}` }]
                        : []),
                ]}
            />

            {pace.drift != null && (
                <p className="-mt-3 text-xs text-neutral-500">
                    Pace:{' '}
                    <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${DELTA_TONE[driftTone(pace.drift)]}`}
                    >
                        {driftLabel(pace.drift)}
                    </span>{' '}
                    by the last completed part
                </p>
            )}

            <SummaryExerciseList rows={rows} />
        </>
    )
}
