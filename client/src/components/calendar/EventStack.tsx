import type { MouseEvent as ReactMouseEvent } from 'react'
import { EVENT_TYPE_ICONS } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { colorsForEvent } from '../../lib/eventColors'
import type { Event } from '../../types'

interface EventStackProps {
    events: Event[]
    disabled?: boolean
    onEventClick: (event: Event) => void
    onAdd: () => void
    onPick: (events: Event[]) => void
    /** Copy this event to the calendar's paste buffer. */
    onCopyEvent?: (event: Event) => void
    /** Paste the buffered event into this slot (date/part already bound). */
    onPaste?: () => void
    /** Whether a copied event is available to paste. */
    canPaste?: boolean
}

/** A small copy affordance shown over a chip on hover. */
function CopyButton({ onCopy }: { onCopy: () => void }) {
    return (
        <button
            type="button"
            aria-label="Copy event"
            title="Copy event"
            onClick={(e) => {
                e.stopPropagation()
                onCopy()
            }}
            className="absolute right-0.5 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded bg-white/70 text-neutral-600 opacity-0 transition-opacity hover:bg-white hover:text-neutral-900 group-hover/chip:opacity-100"
        >
            <i className="fa-solid fa-copy text-[9px]" aria-hidden="true" />
        </button>
    )
}

function Chip({
    event,
    mini = false,
    disabled = false,
    onClick,
    onCopy,
}: {
    event: Event
    mini?: boolean
    disabled?: boolean
    onClick: () => void
    onCopy?: (event: Event) => void
}) {
    const { byId } = useCalendars()
    const { bg, hover, text } = colorsForEvent(event, byId)
    const sizing = mini ? 'min-h-0 flex-1' : 'h-full'
    const base = `flex h-full w-full items-center gap-1 overflow-hidden rounded-md px-1.5 text-left ${bg} ${text}`
    const isBirthday = event._id.startsWith('birthday-')
    const title = (
        <>
            {isBirthday && (
                <i className="fa-solid fa-cake-candles shrink-0 text-[9px] opacity-70" />
            )}
            {EVENT_TYPE_ICONS[event.eventType] && (
                <i
                    className={`${EVENT_TYPE_ICONS[event.eventType]} shrink-0 text-[9px] opacity-80`}
                    aria-hidden="true"
                />
            )}
            <span
                className={`truncate font-semibold leading-tight ${mini ? 'text-[10px]' : 'text-[11px]'}`}
            >
                {event.title}
            </span>
            {event.recurrence && (
                <i className="fa-solid fa-repeat shrink-0 text-[8px] opacity-60" />
            )}
        </>
    )
    return (
        <div className={`group/chip relative ${sizing}`}>
            {disabled ? (
                <div title={event.title} className={`${base} opacity-50`}>
                    {title}
                </div>
            ) : (
                <button
                    type="button"
                    title={event.title}
                    onClick={(e) => {
                        e.stopPropagation()
                        onClick()
                    }}
                    className={`${base} ${hover} transition-colors`}
                >
                    {title}
                </button>
            )}
            {onCopy && <CopyButton onCopy={() => onCopy(event)} />}
        </div>
    )
}

/**
 * Renders the event(s) occupying a single calendar slot.
 * - 0 events: an "add" affordance.
 * - 1 event: a full-height chip.
 * - 2 events: two stacked half-height chips (both titles visible).
 * - 3+ events: the first chip plus a "+N more" that opens a picker.
 */
export default function EventStack({
    events,
    disabled = false,
    onEventClick,
    onAdd,
    onPick,
    onCopyEvent,
    onPaste,
    canPaste = false,
}: EventStackProps) {
    // Right-clicking an empty slot pastes the buffered event instead of showing
    // the browser menu; falls back to the native menu when nothing is copied.
    const pasteHandler =
        canPaste && onPaste
            ? (e: ReactMouseEvent) => {
                  e.preventDefault()
                  onPaste()
              }
            : undefined

    if (events.length === 0) {
        if (disabled) return <div className="h-full w-full" />
        return (
            <button
                type="button"
                onClick={onAdd}
                onContextMenu={pasteHandler}
                title={canPaste ? 'Right-click to paste event' : undefined}
                className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
            >
                <i className="fa-solid fa-plus text-[10px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
            </button>
        )
    }

    if (events.length === 1) {
        return (
            <Chip
                event={events[0]}
                disabled={disabled}
                onClick={() => onEventClick(events[0])}
                onCopy={onCopyEvent}
            />
        )
    }

    const overflow = events.length > 2
    return (
        <div className="flex h-full w-full flex-col gap-px">
            {overflow ? (
                <>
                    <Chip
                        event={events[0]}
                        mini
                        disabled={disabled}
                        onClick={() => onEventClick(events[0])}
                        onCopy={onCopyEvent}
                    />
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={(e) => {
                            e.stopPropagation()
                            onPick(events)
                        }}
                        className="flex min-h-0 flex-1 items-center justify-center rounded-md bg-neutral-200 text-[10px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-300 disabled:opacity-50"
                    >
                        +{events.length - 1} more
                    </button>
                </>
            ) : (
                events.map((e) => (
                    <Chip
                        key={e._id}
                        event={e}
                        mini
                        disabled={disabled}
                        onClick={() => onEventClick(e)}
                        onCopy={onCopyEvent}
                    />
                ))
            )}
        </div>
    )
}
