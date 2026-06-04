import { createPortal } from 'react-dom'
import { useOverlayBehavior } from '../useOverlay'
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, NA_EVENT_COLORS, RECURRENCE_LABELS } from '../../types'
import { MONTHS, WEEKDAYS_LONG } from '../../lib/calendar'
import type { Event } from '../../types'

interface Props {
    event: Event | null
    onClose: () => void
    onEdit: () => void
}

const PART_LABELS: Record<string, string> = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    na: 'N/A',
}

function formatDate(date: string) {
    const [y, m, d] = date.split('-').map(Number)
    return `${WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

function partRange(event: Event): string {
    if (event.allDay) return 'All day'
    if (event.startPart === 'na') return 'N/A — informational'
    if (event.startPart === event.endPart) return PART_LABELS[event.startPart]
    return `${PART_LABELS[event.startPart]} → ${PART_LABELS[event.endPart]}`
}

export default function EventDetailModal({ event, onClose, onEdit }: Props) {
    useOverlayBehavior(!!event, onClose)
    if (!event) return null

    const isNa = event.startPart === 'na'
    const colors = isNa ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[event.eventType]
    const isMultiDay = event.startDate !== event.endDate

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-neutral-900/60" onClick={onClose} aria-hidden="true" />

            <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
            >
                {/* Colour header strip */}
                <div className={`px-6 py-5 ${colors.bg}`}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors.bg} ${colors.text} border border-current/20`}>
                            {isNa ? 'N/A' : EVENT_TYPE_LABELS[event.eventType]}
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-black/10"
                        >
                            <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
                        </button>
                    </div>
                    <h2 className={`text-xl font-bold tracking-tight ${colors.text}`}>{event.title}</h2>
                    {event.recurrence && (
                        <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${colors.text} opacity-70`}>
                            <i className="fa-solid fa-repeat text-[10px]" aria-hidden="true" />
                            Repeats {RECURRENCE_LABELS[event.recurrence.frequency].toLowerCase()}
                            {event.recurrence.endsOn ? ` · ends ${event.recurrence.endsOn}` : ''}
                        </p>
                    )}
                </div>

                {/* Details */}
                <div className="flex flex-col gap-3 px-6 py-5">
                    {/* Date(s) */}
                    <DetailRow icon="fa-regular fa-calendar">
                        {isMultiDay
                            ? <>{formatDate(event.startDate)}<span className="mx-1 text-neutral-400">→</span>{formatDate(event.endDate)}</>
                            : formatDate(event.startDate)
                        }
                    </DetailRow>

                    {/* Part range */}
                    <DetailRow icon="fa-regular fa-clock">
                        {partRange(event)}
                    </DetailRow>

                    {/* Informational time */}
                    {event.time && (
                        <DetailRow icon="fa-solid fa-stopwatch">
                            {event.time}
                        </DetailRow>
                    )}

                    {/* Notes */}
                    {event.notes && (
                        <DetailRow icon="fa-regular fa-note-sticky">
                            <span className="text-neutral-600">{event.notes}</span>
                        </DetailRow>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
                    >
                        Close
                    </button>
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
                    >
                        <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                        Edit
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

function DetailRow({ icon, children }: { icon: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <i className={`${icon} mt-0.5 w-4 shrink-0 text-center text-sm text-neutral-400`} aria-hidden="true" />
            <span className="text-sm font-medium text-neutral-700">{children}</span>
        </div>
    )
}
