import { useState, type ReactNode } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Textarea from '../Textarea'
import { EVENT_TYPE_LABELS, RECURRENCE_LABELS, CALENDAR_COLOR_CLASSES } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import type { Event } from '../../types'
import { StatStrip, type Stat } from '../session/SessionUI'
import { TypeTile, nightsBetween, partsLabel, relativeDay, shortDate } from './eventUi'

interface Props {
    event: Event | null
    onClose: () => void
    onEdit: () => void
    /** Delete the event. Non-recurring events go straight out; recurring ones are
     * expected to open a this-one / whole-series dialog. Omitted for events that
     * can't be deleted (e.g. synthetic birthdays). */
    onDelete?: (event: Event) => void | Promise<void>
    /** Persist an inline notes edit. When omitted, notes are shown read-only. */
    onSaveNotes?: (notes: string) => Promise<void>
}

/**
 * An event, read at a glance: its type tile and title, a strip of when / how
 * long / time, where, how it repeats and its notes (editable in place). Opens
 * as a drawer, like a session or a meal does elsewhere.
 */
export default function EventDetailModal({
    event,
    onClose,
    onEdit,
    onDelete,
    onSaveNotes,
}: Props) {
    const { byId } = useCalendars()
    const [deleting, setDeleting] = useState(false)
    const [editingNotes, setEditingNotes] = useState(false)
    const [notesDraft, setNotesDraft] = useState(event?.notes ?? '')
    const [savingNotes, setSavingNotes] = useState(false)

    // Keep the last event while the drawer slides shut.
    const [shown, setShown] = useState<Event | null>(event)
    if (event && event !== shown) setShown(event)

    // Reset the inline notes editor whenever the viewed event changes.
    const notesKey = `${event?._id}|${event?.notes ?? ''}`
    const [lastNotesKey, setLastNotesKey] = useState(notesKey)
    if (notesKey !== lastNotesKey) {
        setLastNotesKey(notesKey)
        setEditingNotes(false)
        setNotesDraft(event?.notes ?? '')
    }

    const e = shown

    async function handleDelete() {
        if (!onDelete || !e) return
        setDeleting(true)
        try {
            await onDelete(e)
        } finally {
            setDeleting(false)
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

    const calendar = e?.calendar ? byId.get(e.calendar) : undefined
    const isMultiDay = !!e && e.startDate !== e.endDate

    const stats: Stat[] = e
        ? [
              isMultiDay
                  ? { icon: 'fa-regular fa-calendar', label: 'From', value: shortDate(e.startDate) }
                  : { icon: 'fa-regular fa-calendar', label: 'Date', value: shortDate(e.startDate, true) },
              isMultiDay
                  ? { icon: 'fa-regular fa-calendar-check', label: 'To', value: shortDate(e.endDate) }
                  : { icon: 'fa-regular fa-clock', label: 'When', value: partsLabel(e.startPart, e.endPart) },
              ...(isMultiDay
                  ? [
                        {
                            icon: 'fa-solid fa-moon',
                            label: 'Length',
                            value: `${nightsBetween(e.startDate, e.endDate)} ${nightsBetween(e.startDate, e.endDate) === 1 ? 'night' : 'nights'}`,
                        },
                    ]
                  : e.time
                    ? [{ icon: 'fa-solid fa-stopwatch', label: 'Time', value: e.time }]
                    : []),
          ]
        : []

    return (
        <Drawer
            open={!!event}
            onClose={onClose}
            size="xl"
            title="Event"
            badge={e ? relativeDay(e.startDate) : undefined}
            footer={
                <>
                    {onDelete && (
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={handleDelete}
                            disabled={deleting}
                            className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </Button>
                    )}
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                    <Button icon="fa-solid fa-pen" onClick={onEdit}>
                        Edit
                    </Button>
                </>
            }
        >
            {e && (
                <div className="flex flex-col gap-6">
                    {/* Title block */}
                    <div className="flex items-start gap-3.5">
                        <TypeTile type={e.eventType} size="lg" />
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-neutral-950">
                                {e.title}
                            </h2>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-neutral-500">
                                <span>{e.startPart === 'na' ? 'Anytime' : EVENT_TYPE_LABELS[e.eventType]}</span>
                                {calendar && !calendar.isDefault && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <span
                                            className={`h-2 w-2 rounded-full ${CALENDAR_COLOR_CLASSES[calendar.color].dot}`}
                                            aria-hidden="true"
                                        />
                                        {calendar.name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <StatStrip stats={stats} />

                    {(e.location || e.recurrence) && (
                        <div className="flex flex-col gap-3">
                            {e.location && <DetailRow icon="fa-solid fa-location-dot">{e.location}</DetailRow>}
                            {e.recurrence && (
                                <DetailRow icon="fa-solid fa-repeat">
                                    Repeats {RECURRENCE_LABELS[e.recurrence.frequency].toLowerCase()}
                                    {e.recurrence.endsOn ? ` · until ${shortDate(e.recurrence.endsOn, true)}` : ''}
                                </DetailRow>
                            )}
                        </div>
                    )}

                    {/* Notes — inline-editable when onSaveNotes is provided */}
                    <section className="flex flex-col gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Notes</p>
                        {onSaveNotes && editingNotes ? (
                            <div className="flex flex-col gap-2">
                                <Textarea
                                    rows={4}
                                    autoFocus
                                    placeholder="Add notes…"
                                    value={notesDraft}
                                    onChange={(ev) => setNotesDraft(ev.target.value)}
                                />
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setNotesDraft(e.notes ?? '')
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
                        ) : e.notes ? (
                            <button
                                type="button"
                                onClick={() => onSaveNotes && setEditingNotes(true)}
                                disabled={!onSaveNotes}
                                className="group rounded-2xl bg-neutral-50 px-4 py-3.5 text-left transition-colors enabled:hover:bg-neutral-100"
                            >
                                <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{e.notes}</p>
                                {onSaveNotes && (
                                    <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                                        <i className="fa-solid fa-pen text-[10px]" aria-hidden="true" />
                                        Edit notes
                                    </span>
                                )}
                            </button>
                        ) : onSaveNotes ? (
                            <button
                                type="button"
                                onClick={() => setEditingNotes(true)}
                                className="flex items-center gap-2 rounded-2xl border border-dashed border-neutral-300 px-4 py-3.5 text-sm font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
                            >
                                <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                                Add notes
                            </button>
                        ) : (
                            <p className="text-sm text-neutral-500">No notes.</p>
                        )}
                    </section>
                </div>
            )}
        </Drawer>
    )
}

function DetailRow({ icon, children }: { icon: string; children: ReactNode }) {
    return (
        <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-neutral-100 text-xs text-neutral-600" aria-hidden="true">
                <i className={icon} />
            </span>
            <span className="text-sm text-neutral-800">{children}</span>
        </div>
    )
}
