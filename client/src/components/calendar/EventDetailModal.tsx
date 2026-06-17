import { useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import {
    EVENT_TYPE_LABELS,
    EVENT_TYPE_COLORS,
    NA_EVENT_COLORS,
    RECURRENCE_LABELS,
} from '../../types'
import { MONTHS, WEEKDAYS_LONG } from '../../lib/calendar'
import type { Event } from '../../types'

interface Props {
    event: Event | null
    onClose: () => void
    onEdit: () => void
    onDeleteOccurrence?: (event: Event) => Promise<void>
}

const PART_LABELS: Record<string, string> = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    na: 'N/A',
}

function daysUntilLabel(dateStr: string): string {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [y, m, d] = dateStr.split('-').map(Number)
    const target = new Date(y, m - 1, d)
    const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff === -1) return 'Yesterday'
    if (diff > 0) return `In ${diff} days`
    return `${Math.abs(diff)} days ago`
}

function formatDate(date: string) {
    const [y, m, d] = date.split('-').map(Number)
    return `${WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

function nightsBetween(start: string, end: string): number {
    const [y1, m1, d1] = start.split('-').map(Number)
    const [y2, m2, d2] = end.split('-').map(Number)
    return Math.round(
        (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86_400_000
    )
}

function partRange(event: Event): string {
    if (event.allDay) return 'All day'
    if (event.startPart === 'na') return 'N/A — informational'
    if (event.startPart === event.endPart) return PART_LABELS[event.startPart]
    return `${PART_LABELS[event.startPart]} → ${PART_LABELS[event.endPart]}`
}

export default function EventDetailModal({ event, onClose, onEdit, onDeleteOccurrence }: Props) {
    const [deletingOccurrence, setDeletingOccurrence] = useState(false)
    if (!event) return null

    async function handleDeleteOccurrence() {
        if (!onDeleteOccurrence) return
        setDeletingOccurrence(true)
        try {
            await onDeleteOccurrence(event!)
        } finally {
            setDeletingOccurrence(false)
        }
    }

    const isNa = event.startPart === 'na'
    const colors = isNa ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[event.eventType]
    const isMultiDay = event.startDate !== event.endDate

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Close
                    </Button>
                    {event.recurrence && onDeleteOccurrence && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeleteOccurrence}
                            disabled={deletingOccurrence}
                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                        >
                            Remove this occurrence
                        </Button>
                    )}
                    <Button size="sm" icon="fa-solid fa-pen" onClick={onEdit}>
                        Edit
                    </Button>
                </>
            }
        >
            {/* Title block */}
            <div className="flex items-center gap-2">
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colors.bg} ${colors.text}`}
                >
                    {isNa ? 'N/A' : EVENT_TYPE_LABELS[event.eventType]}
                </span>
                <span className="text-xs font-medium text-neutral-400">
                    {daysUntilLabel(event.startDate)}
                </span>
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-950">
                {event.title}
            </h2>
            {event.recurrence && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                    <i className="fa-solid fa-repeat text-[10px]" aria-hidden="true" />
                    Repeats {RECURRENCE_LABELS[event.recurrence.frequency].toLowerCase()}
                    {event.recurrence.endsOn ? ` · ends ${event.recurrence.endsOn}` : ''}
                </p>
            )}

            {/* Details */}
            <div className="mt-5 flex flex-col gap-3.5">
                {/* Date(s) */}
                <DetailRow icon="fa-regular fa-calendar">
                    {isMultiDay ? (
                        <>
                            {formatDate(event.startDate)}
                            <span className="mx-1 text-neutral-300">→</span>
                            {formatDate(event.endDate)}
                            {(() => {
                                const nights = nightsBetween(event.startDate, event.endDate)
                                return (
                                    <span className="ml-2 whitespace-nowrap text-neutral-400">
                                        · {nights} {nights === 1 ? 'night' : 'nights'}
                                    </span>
                                )
                            })()}
                        </>
                    ) : (
                        formatDate(event.startDate)
                    )}
                </DetailRow>

                {/* Part range */}
                <DetailRow icon="fa-regular fa-clock">{partRange(event)}</DetailRow>

                {/* Informational time */}
                {event.time && <DetailRow icon="fa-solid fa-stopwatch">{event.time}</DetailRow>}

                {/* Location */}
                {event.location && (
                    <DetailRow icon="fa-solid fa-location-dot">{event.location}</DetailRow>
                )}

                {/* Budget */}
                {event.budget != null && (
                    <DetailRow icon="fa-solid fa-wallet">
                        £
                        {event.budget.toLocaleString('en-GB', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                        {event.budgetRow && event.budgetRowName && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-neutral-400">
                                <i className="fa-solid fa-link text-[10px]" aria-hidden="true" />
                                {event.budgetRowName}
                            </span>
                        )}
                    </DetailRow>
                )}

                {/* Notes */}
                {event.notes && (
                    <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                        <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                            {event.notes}
                        </p>
                    </div>
                )}
            </div>
        </Modal>
    )
}

function DetailRow({ icon, children }: { icon: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <i
                className={`${icon} mt-0.5 w-4 shrink-0 text-center text-sm text-neutral-400`}
                aria-hidden="true"
            />
            <span className="text-sm font-medium text-neutral-700">{children}</span>
        </div>
    )
}
