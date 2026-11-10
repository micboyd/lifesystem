import { Link } from 'react-router-dom'
import Badge from '../Badge'
import Button from '../Button'
import type { GarminState, WatchStep } from '../../types'
import type { GarminErrorCode } from '../../services/garmin'
import { GARMIN_STATE_LABEL, STEP_TYPE_LABEL, stepEnd, stepPace } from '../../lib/garminSteps'

/** What the panel shows: the saved state, or a send in flight / just failed. */
export type GarminUiState = GarminState | 'sending' | 'failed'

const BADGE: Record<GarminUiState, { variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
    not_sent: { variant: 'neutral', label: GARMIN_STATE_LABEL.not_sent },
    sending: { variant: 'info', label: 'Sending…' },
    sent: { variant: 'success', label: GARMIN_STATE_LABEL.sent },
    out_of_date: { variant: 'warning', label: GARMIN_STATE_LABEL.out_of_date },
    moved: { variant: 'warning', label: GARMIN_STATE_LABEL.moved },
    failed: { variant: 'danger', label: 'Failed' },
}

export function GarminStateBadge({ state }: { state: GarminUiState }) {
    const b = BADGE[state]
    return <Badge variant={b.variant}>{b.label}</Badge>
}

/**
 * The steps the watch will run, one row each: what it is, how it ends, and any
 * pace alert. Repeats show their count with their steps indented beneath.
 * Steps that are a best guess are marked, so it's clear what to check.
 */
export function WatchStepList({ steps, approximated = [] }: { steps: WatchStep[]; approximated?: string[] }) {
    const guessed = new Set(approximated)
    return (
        <ol className="flex flex-col gap-1.5">
            {steps.map((s, i) =>
                s.type === 'repeat' ? (
                    <li key={i} className="rounded-xl bg-neutral-50 px-3 py-2.5">
                        <p className="mb-1.5 text-[13px] font-semibold text-neutral-900">
                            <i className="fa-solid fa-repeat mr-1.5 text-[11px] text-neutral-500" aria-hidden="true" />
                            Repeat {s.times}×
                        </p>
                        <WatchStepList steps={s.steps} approximated={approximated} />
                    </li>
                ) : (
                    <li key={i} className="flex min-w-0 items-start justify-between gap-3 py-1">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-neutral-900">{s.label}</p>
                            <p className="text-[13px] text-neutral-500">
                                {STEP_TYPE_LABEL[s.type]}
                                {guessed.has(s.label) && (
                                    <span className="text-amber-700"> · approximated</span>
                                )}
                            </p>
                        </div>
                        <div className="shrink-0 text-right">
                            <p className="text-sm tabular-nums text-neutral-900">{stepEnd(s)}</p>
                            {stepPace(s) && (
                                <p className="text-[13px] tabular-nums text-neutral-500">{stepPace(s)}</p>
                            )}
                        </div>
                    </li>
                )
            )}
        </ol>
    )
}

/**
 * A failed send: the message, and the way out — reconnect for an account
 * problem, otherwise try again.
 */
export function GarminErrorBlock({
    code,
    message,
    onRetry,
}: {
    code: GarminErrorCode
    message: string
    onRetry?: () => void
}) {
    const reconnect = code === 'not_connected' || code === 'session_expired'
    return (
        <div className="flex flex-col gap-3 rounded-2xl bg-danger-bg px-4 py-3.5 text-red-700 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm">
                <i className="fa-solid fa-circle-exclamation mr-2" aria-hidden="true" />
                {message}
            </p>
            <div className="flex shrink-0 gap-2">
                {reconnect && (
                    <Link
                        to="/profile#garmin"
                        className="inline-flex h-9 items-center rounded-[10px] border border-neutral-200 bg-white px-3.5 text-[13px] font-medium text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50"
                    >
                        {code === 'session_expired' ? 'Reconnect Garmin' : 'Connect Garmin'}
                    </Link>
                )}
                {onRetry && (
                    <Button variant="secondary" size="sm" icon="fa-solid fa-rotate-right" onClick={onRetry}>
                        Retry
                    </Button>
                )}
            </div>
        </div>
    )
}
