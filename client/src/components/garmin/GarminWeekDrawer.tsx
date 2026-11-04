import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Spinner from '../Spinner'
import Progress from '../Progress'
import { listPlanEntries } from '../../services/fitnessPlan'
import {
    garminError,
    listGarminStates,
    sendToGarmin,
    type GarminEntryState,
    type GarminErrorCode,
} from '../../services/garmin'
import type { FitnessPlanEntry, GarminState } from '../../types'
import { addDays, formatDateShort } from '../../lib/calendar'
import { GarminErrorBlock, GarminStateBadge } from './GarminParts'

/** One row's outcome from this run. */
type RowResult =
    | { kind: 'sent'; message: string; pushed: boolean }
    | { kind: 'failed'; code: GarminErrorCode; message: string }
    | { kind: 'skipped'; message: string }

/** An account problem stops the run: every send after it would fail the same way. */
const STOPS: GarminErrorCode[] = ['not_configured', 'worker_unavailable', 'not_connected', 'session_expired']

/**
 * Send the next 7 days of conditioning to Garmin, one at a time so each gets
 * its own result and nothing trips Garmin's rate limits. Sessions already on
 * Garmin and current are left alone; skipped ones aren't sent.
 */
export default function GarminWeekDrawer({
    open,
    today,
    onClose,
    onSent,
}: {
    open: boolean
    today: string
    onClose: () => void
    onSent: (entryId: string, state: GarminState) => void
}) {
    const end = addDays(today, 6)
    const [entries, setEntries] = useState<FitnessPlanEntry[] | null>(null)
    const [states, setStates] = useState<Record<string, GarminEntryState>>({})
    const [loadError, setLoadError] = useState<{ code: GarminErrorCode; message: string } | null>(null)
    const [running, setRunning] = useState(false)
    const [done, setDone] = useState(0)
    const [results, setResults] = useState<Record<string, RowResult>>({})
    const [current, setCurrent] = useState<string | null>(null)

    function fetchWeek() {
        return Promise.all([listPlanEntries(today, end), listGarminStates(today, end)])
            .then(([list, s]) => {
                setEntries(
                    list
                        .filter((e) => e.kind === 'conditioning' && e.session)
                        .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
                )
                setStates(s)
            })
            .catch((err) => setLoadError(garminError(err)))
    }

    function load() {
        setLoadError(null)
        setEntries(null)
        void fetchWeek()
    }

    // Each opening starts fresh: the week as it is now, no results from last time.
    const [wasOpen, setWasOpen] = useState(false)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            setResults({})
            setDone(0)
            setEntries(null)
            setLoadError(null)
        }
    }

    useEffect(() => {
        if (open) void fetchWeek()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, today])

    const toSend = (entries ?? []).filter((e) => !e.skipped && states[e._id]?.state !== 'sent')

    async function run() {
        setRunning(true)
        setDone(0)
        const next: Record<string, RowResult> = {}
        for (const e of entries ?? []) {
            if (e.skipped) next[e._id] = { kind: 'skipped', message: 'Skipped on the plan' }
            else if (states[e._id]?.state === 'sent') next[e._id] = { kind: 'skipped', message: 'Already on Garmin' }
        }
        setResults({ ...next })
        let stopped: RowResult | null = null
        for (const e of toSend) {
            if (stopped) {
                next[e._id] = { kind: 'skipped', message: 'Not sent' }
                continue
            }
            setCurrent(e._id)
            try {
                const r = await sendToGarmin(e._id)
                next[e._id] = { kind: 'sent', message: r.message, pushed: r.pushed }
                setStates((s) => ({ ...s, [e._id]: { state: 'sent', lastSentAt: r.lastSentAt, scheduledDate: r.scheduledDate } }))
                onSent(e._id, 'sent')
            } catch (err) {
                const { code, message } = garminError(err)
                next[e._id] = { kind: 'failed', code, message }
                if (STOPS.includes(code)) stopped = next[e._id]
            }
            setResults({ ...next })
            setDone((n) => n + 1)
        }
        setResults({ ...next })
        setCurrent(null)
        setRunning(false)
    }

    const stop = Object.values(results).find(
        (r): r is Extract<RowResult, { kind: 'failed' }> => r.kind === 'failed' && STOPS.includes(r.code)
    )
    const finished = !running && Object.keys(results).length > 0

    return (
        <Drawer
            open={open}
            onClose={running ? () => {} : onClose}
            size="lg"
            title="Send next 7 days to Garmin"
            footer={
                <div className="flex w-full items-center justify-end gap-3">
                    <Button variant="ghost" onClick={onClose} disabled={running}>
                        {finished ? 'Done' : 'Cancel'}
                    </Button>
                    {!finished && (
                        <Button
                            icon={running ? undefined : 'fa-solid fa-paper-plane'}
                            onClick={run}
                            disabled={running || !entries || toSend.length === 0}
                        >
                            {running
                                ? `Sending ${Math.min(done + 1, toSend.length)} of ${toSend.length}…`
                                : toSend.length === 0
                                  ? 'Nothing to send'
                                  : `Send ${toSend.length} ${toSend.length === 1 ? 'session' : 'sessions'}`}
                        </Button>
                    )}
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-sm text-neutral-600">
                    Conditioning from {formatDateShort(today)} to {formatDateShort(end)}. Each goes onto your
                    Garmin calendar on its day and to your watch, one at a time.
                </p>
                {(running || finished) && toSend.length > 0 && (
                    <Progress value={(done / toSend.length) * 100} variant={finished ? 'success' : 'default'} />
                )}
                {stop && <GarminErrorBlock code={stop.code} message={stop.message} />}
                {loadError && <GarminErrorBlock {...loadError} onRetry={load} />}
                {!entries && !loadError && (
                    <div className="grid place-items-center py-10">
                        <Spinner />
                    </div>
                )}
                {entries && entries.length === 0 && (
                    <p className="rounded-2xl bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
                        No conditioning planned in the next 7 days.
                    </p>
                )}
                {entries && entries.length > 0 && (
                    <ul className="flex flex-col divide-y divide-neutral-100">
                        {entries.map((e) => {
                            const r = results[e._id]
                            const state = states[e._id]?.state ?? 'not_sent'
                            return (
                                <li key={e._id} className="flex items-start justify-between gap-3 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-neutral-900">
                                            {e.session?.name}
                                        </p>
                                        <p className="text-[13px] text-neutral-500">
                                            {formatDateShort(e.date)}
                                            {r && (
                                                <span
                                                    className={
                                                        r.kind === 'failed'
                                                            ? 'text-red-600'
                                                            : r.kind === 'sent' && !r.pushed
                                                              ? 'text-info'
                                                              : ''
                                                    }
                                                >
                                                    {' · '}
                                                    {r.message}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="shrink-0">
                                        {current === e._id ? (
                                            <GarminStateBadge state="sending" />
                                        ) : r?.kind === 'failed' ? (
                                            <GarminStateBadge state="failed" />
                                        ) : e.skipped ? (
                                            <span className="text-[13px] text-neutral-400">Skipped</span>
                                        ) : (
                                            <GarminStateBadge state={state} />
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}
                {finished && Object.values(results).some((r) => r.kind === 'failed') && !stop && (
                    <Button variant="secondary" icon="fa-solid fa-rotate-right" onClick={run} className="self-start">
                        Retry failed
                    </Button>
                )}
            </div>
        </Drawer>
    )
}
