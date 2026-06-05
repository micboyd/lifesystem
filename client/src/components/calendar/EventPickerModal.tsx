import Modal from '../Modal'
import { EVENT_TYPE_COLORS, NA_EVENT_COLORS, EVENT_TYPE_LABELS } from '../../types'
import type { Event } from '../../types'

interface Props {
    events: Event[] | null
    onClose: () => void
    onSelect: (event: Event) => void
}

export default function EventPickerModal({ events, onClose, onSelect }: Props) {
    return (
        <Modal open={events !== null} onClose={onClose} title="Events" size="sm">
            <div className="flex flex-col gap-2">
                {events?.map((event) => {
                    const isNa = event.startPart === 'na'
                    const colors = isNa ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[event.eventType]
                    return (
                        <button
                            key={event._id}
                            type="button"
                            onClick={() => onSelect(event)}
                            className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                        >
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.bg}`} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-neutral-900">{event.title}</span>
                                <span className="text-xs text-neutral-400">
                                    {isNa ? 'Other' : EVENT_TYPE_LABELS[event.eventType]}
                                    {event.recurrence && ' · recurring'}
                                </span>
                            </span>
                            <i className="fa-solid fa-chevron-right text-xs text-neutral-300" aria-hidden="true" />
                        </button>
                    )
                })}
            </div>
        </Modal>
    )
}
