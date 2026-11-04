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

// Short, so the button sits beside its row on a phone; the row says "Garmin watch".
const SEND_LABEL: Record<GarminState, string> = {
    not_sent: 'Send',
    sent: 'Resend',
    out_of_date: 'Update',
    moved: 'Reschedule',
}

/**
 * Send to Garmin, as one row of a planned conditioning session's drawer: a
 * state badge (not sent, sending, on Garmin, out of date, moved or failed), one
 * detail line and a small send button. The steps the watch will run fold away
 * behind "Show watch steps", since the session's parts are already on show;
 * any that are a best guess are counted on the detail line so they get checked.
 * The parent draws the frame (a divided list), so it sits with the route row.
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
                // Folded away: the session's own parts are already on show above.
                setShowSteps(false)
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
    const guessed = preview?.approximated.length ?? 0

    return (
        <div className="flex flex-col gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-neutral-900">
                        Garmin watch
                        {preview && <GarminStateBadge state={uiState} />}
                    </p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                        {preview ? (
                            <>
                                {stateLine(preview)}
                                {guessed > 0 && (
                                    <span className="text-amber-700">
                                        {' '}
                                        · {guessed} approximated
                                    </span>
                                )}
                            </>
                        ) : loadError ? (
                            'Couldn’t load the workout.'
                        ) : (
                            'Working out the steps…'
                        )}
                    </p>
                </div>
                {preview ? (
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={sending ? undefined : 'fa-solid fa-paper-plane'}
                        onClick={send}
                        disabled={sending}
                        className="shrink-0"
                    >
                        {sending ? 'Sending…' : SEND_LABEL[preview.state]}
                    </Button>
                ) : (
                    !loadError && <Spinner size="sm" />
                )}
            </div>

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
                    {showSteps && guessed > 0 && (
                        <p className="rounded-xl bg-warning-bg px-3 py-2.5 text-[13px] text-amber-800">
                            {guessed === 1 ? 'One step is' : `${guessed} steps are`} approximated from the
                            plan’s timings: {preview.approximated.join(', ')}.
                        </p>
                    )}
                    {showSteps && <WatchStepList steps={preview.steps} approximated={preview.approximated} />}
                    <button
                        type="button"
                        onClick={() => setShowSteps((v) => !v)}
                        aria-expanded={showSteps}
                        className="flex items-center gap-1.5 self-start text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
                    >
                        <i className={`fa-solid fa-chevron-${showSteps ? 'up' : 'down'} text-[10px]`} aria-hidden="true" />
                        {showSteps ? 'Hide watch steps' : 'Show watch steps'}
                    </button>
                </>
            )}
        </div>
    )
}

/** The one detail the badge doesn't already say. */
function stateLine(p: GarminPreview): string {
    if (p.state === 'not_sent') return `${countSteps(p.steps)} steps`
    if (p.state === 'moved' && p.scheduledDate) return `Garmin has it on ${formatDateShort(p.scheduledDate)}`
    if (p.state === 'out_of_date') return 'The session changed since it was sent'
    return p.lastSentAt
        ? `Sent ${new Date(p.lastSentAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
        : 'On your Garmin calendar'
}
