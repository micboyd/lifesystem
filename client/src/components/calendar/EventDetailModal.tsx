import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import Textarea from '../Textarea'
import { EVENT_TYPE_LABELS, RECURRENCE_LABELS } from '../../types'
import { MONTHS, WEEKDAYS_LONG } from '../../lib/calendar'
import { useCalendars } from '../../context/CalendarsContext'
import { colorsForEvent } from '../../lib/eventColors'
import type { Event } from '../../types'

interface Props {
    event: Event | null
    onClose: () => void
    onEdit: () => void
    onDeleteOccurrence?: (event: Event) => Promise<void>
    /** Persist an inline notes edit. When omitted, notes are shown read-only. */
    onSaveNotes?: (notes: string) => Promise<void>
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

export default function EventDetailModal({
    event,
    onClose,
    onEdit,
    onDeleteOccurrence,
    onSaveNotes,
}: Props) {
    const { byId } = useCalendars()
    const [deletingOccurrence, setDeletingOccurrence] = useState(false)
    const [editingNotes, setEditingNotes] = useState(false)
    const [notesDraft, setNotesDraft] = useState('')
    const [savingNotes, setSavingNotes] = useState(false)

    // Reset the inline notes editor whenever the viewed event changes.
    useEffect(() => {
        setEditingNotes(false)
        setNotesDraft(event?.notes ?? '')
    }, [event?._id, event?.notes])

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

    async function handleSaveNotes() {
        if (!onSaveNotes) return
        setSavingNotes(true)
        try {
            await onSaveNotes(notesDraft.trim())
            setEditingNotes(false)
        } finally {
            setSavingNotes(false)
        }
    }

    const isNa = event.startPart === 'na'
    const colors = colorsForEvent(event, byId)
    const calendar = event.calendar ? byId.get(event.calendar) : undefined
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
                {calendar && !calendar.isDefault && (
                    <span className="text-xs font-semibold text-neutral-500">{calendar.name}</span>
                )}
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

                {/* Notes — inline-editable when onSaveNotes is provided */}
                {onSaveNotes ? (
                    editingNotes ? (
                        <div className="flex flex-col gap-2">
                            <Textarea
                                rows={3}
                                autoFocus
                                placeholder="Add notes…"
                                value={notesDraft}
                                onChange={(e) => setNotesDraft(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setNotesDraft(event.notes ?? '')
                                        setEditingNotes(false)
                                    }}
                                    disabled={savingNotes}
                                >
                                    Cancel
                                </Button>
                                <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                                    {savingNotes ? 'Saving…' : 'Save notes'}
                                </Button>
                            </div>
                        </div>
                    ) : event.notes ? (
                        <button
                            type="button"
                            onClick={() => setEditingNotes(true)}
                            className="group rounded-2xl bg-neutral-50 px-4 py-3 text-left transition-colors hover:bg-neutral-100"
                        >
                            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                                {event.notes}
                            </p>
                            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-neutral-400 group-hover:text-neutral-500">
                                <i className="fa-solid fa-pen text-[10px]" aria-hidden="true" />
                                Edit notes
                            </span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setEditingNotes(true)}
                            className="flex items-center gap-2 rounded-2xl border border-dashed border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600"
                        >
                            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                            Add notes
                        </button>
                    )
                ) : (
                    event.notes && (
                        <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                                {event.notes}
                            </p>
                        </div>
                    )
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
