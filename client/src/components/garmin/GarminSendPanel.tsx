import { useEffect, useState } from 'react'
import Button from '../Button'
import Spinner from '../Spinner'
import {
    garminError,
    getGarminPreview,
    sendToGarmin,
    type GarminErrorCode,
    type GarminPreview,
} from '../../services/garmin'
import type { GarminState } from '../../types'
import { countSteps } from '../../lib/garminSteps'
import { formatDateShort } from '../../lib/calendar'
import { GarminErrorBlock, GarminStateBadge, WatchStepList, type GarminUiState } from './GarminParts'

const SEND_LABEL: Record<GarminState, string> = {
    not_sent: 'Send to Garmin',
    sent: 'Send again',
    out_of_date: 'Update on Garmin',
    moved: 'Reschedule on Garmin',
}

/**
 * Send to Garmin, inside a planned conditioning session's drawer. Before the
 * first send it shows the steps the watch will run — with any that are a best
 * guess marked — so they're seen before anything goes; after, they fold away
 * behind "Show steps". The state reads not sent, sending, on Garmin, out of
 * date (the session changed since), moved (the day changed since) or failed.
 */
export default function GarminSendPanel({
    entryId,
    onSent,
}: {
    entryId: string
    /** A send went through, so the planner can update the row. */
    onSent: (entryId: string, state: GarminState) => void
}) {
    const [preview, setPreview] = useState<GarminPreview | null>(null)
    const [loadError, setLoadError] = useState<{ code: GarminErrorCode; message: string } | null>(null)
    const [sending, setSending] = useState(false)
    const [sendError, setSendError] = useState<{ code: GarminErrorCode; message: string } | null>(null)
    const [result, setResult] = useState<{ message: string; pushed: boolean } | null>(null)
    const [showSteps, setShowSteps] = useState(false)

    // Each entry starts fresh: its own preview, no result from the last one.
    const [loadedFor, setLoadedFor] = useState<string | null>(null)
    if (loadedFor !== entryId) {
        setLoadedFor(entryId)
        setPreview(null)
        setLoadError(null)
        setResult(null)
        setSendError(null)
    }

    function fetchPreview() {
        return getGarminPreview(entryId)
            .then((p) => {
                setPreview(p)
                setShowSteps(p.state === 'not_sent')
            })
            .catch((err) => setLoadError(garminError(err)))
    }

    function load() {
        setLoadError(null)
        void fetchPreview()
    }

    useEffect(() => {
        void fetchPreview()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entryId])

    async function send() {
        setSending(true)
        setSendError(null)
        setResult(null)
        try {
            const r = await sendToGarmin(entryId)
            setPreview((p) => (p ? { ...p, state: 'sent', lastSentAt: r.lastSentAt, scheduledDate: r.scheduledDate } : p))
            setResult({ message: r.message, pushed: r.pushed })
            setShowSteps(false)
            onSent(entryId, 'sent')
        } catch (err) {
            setSendError(garminError(err))
        } finally {
            setSending(false)
        }
    }

    const uiState: GarminUiState = sending ? 'sending' : sendError ? 'failed' : (preview?.state ?? 'not_sent')

    return (
        <section className="flex flex-col gap-3 rounded-2xl ring-1 ring-inset ring-neutral-900/[0.06] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600">
                        <i className="fa-solid fa-stopwatch text-sm" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">Garmin watch</p>
                        <p className="text-[13px] text-neutral-500">
                            {preview
                                ? stateLine(preview)
                                : loadError
                                  ? 'Couldn’t load the workout.'
                                  : 'Working out the steps…'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {preview && <GarminStateBadge state={uiState} />}
                    {preview && (
                        <Button
                            size="sm"
                            variant={preview.state === 'sent' ? 'secondary' : 'strong'}
                            icon={sending ? undefined : 'fa-solid fa-paper-plane'}
                            onClick={send}
                            disabled={sending}
                        >
                            {sending ? 'Sending…' : SEND_LABEL[preview.state]}
                        </Button>
                    )}
                </div>
            </div>

            {!preview && !loadError && (
                <div className="grid place-items-center py-4">
                    <Spinner size="sm" />
                </div>
            )}
            {loadError && <GarminErrorBlock {...loadError} onRetry={load} />}
            {sendError && <GarminErrorBlock {...sendError} onRetry={send} />}
            {result && (
                <p
                    className={`rounded-xl px-3 py-2.5 text-sm ${result.pushed ? 'bg-success-bg text-emerald-800' : 'bg-info-bg text-info'}`}
                >
                    <i
                        className={`mr-2 fa-solid ${result.pushed ? 'fa-circle-check' : 'fa-circle-info'}`}
                        aria-hidden="true"
                    />
                    {result.message}
                </p>
            )}

            {preview && (
                <>
                    {preview.approximated.length > 0 && showSteps && (
                        <p className="rounded-xl bg-warning-bg px-3 py-2.5 text-[13px] text-amber-800">
                            {preview.approximated.length === 1 ? 'One step is' : `${preview.approximated.length} steps are`}{' '}
                            approximated from the plan’s timings: {preview.approximated.join(', ')}.
                        </p>
                    )}
                    {showSteps ? (
                        <WatchStepList steps={preview.steps} approximated={preview.approximated} />
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setShowSteps((v) => !v)}
                        className="self-start text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
                    >
                        {showSteps ? 'Hide steps' : `Show steps (${countSteps(preview.steps)})`}
                    </button>
                </>
            )}
        </section>
    )
}

function stateLine(p: GarminPreview): string {
    if (p.state === 'not_sent') return `${countSteps(p.steps)} steps, ready to send.`
    if (p.state === 'moved' && p.scheduledDate)
        return `Moved since it was sent — Garmin has it on ${formatDateShort(p.scheduledDate)}.`
    if (p.state === 'out_of_date') return 'The session has changed since it was sent.'
    return p.lastSentAt ? `Sent ${new Date(p.lastSentAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : 'On your Garmin calendar.'
}
