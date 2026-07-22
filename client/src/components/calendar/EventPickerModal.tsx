import Modal from '../Modal'
import { EVENT_TYPE_LABELS } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { colorsForEvent } from '../../lib/eventColors'
import type { Event } from '../../types'

interface Props {
    events: Event[] | null
    onClose: () => void
    onSelect: (event: Event) => void
}

export default function EventPickerModal({ events, onClose, onSelect }: Props) {
    const { byId } = useCalendars()
    return (
        <Modal open={events !== null} onClose={onClose} title="Events" size="sm">
            <div className="flex flex-col gap-2">
                {events?.map((event) => {
                    const isNa = event.startPart === 'na'
                    const colors = colorsForEvent(event, byId)
                    const calendar = event.calendar ? byId.get(event.calendar) : undefined
                    return (
                        <button
                            key={event._id}
                            type="button"
                            onClick={() => onSelect(event)}
                            className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                        >
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.bg}`} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-neutral-900">
                                    {event.title}
                                </span>
                                <span className="text-xs text-neutral-400">
                                    {calendar && !calendar.isDefault && `${calendar.name} · `}
                                    {isNa ? 'Other' : EVENT_TYPE_LABELS[event.eventType]}
                                    {event.recurrence && ' · recurring'}
                                </span>
                            </span>
                            <i
                                className="fa-solid fa-chevron-right text-xs text-neutral-300"
                                aria-hidden="true"
                            />
                        </button>
                    )
                })}
            </div>
        </Modal>
    )
}
