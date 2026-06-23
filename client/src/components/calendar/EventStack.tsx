import { EVENT_TYPE_COLORS, NA_EVENT_COLORS } from '../../types'
import type { Event } from '../../types'

interface EventStackProps {
    events: Event[]
    disabled?: boolean
    onEventClick: (event: Event) => void
    onAdd: () => void
    onPick: (events: Event[]) => void
}

function colorsFor(e: Event) {
    return e.startPart === 'na' ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[e.eventType]
}

function Chip({
    event,
    mini = false,
    disabled = false,
    onClick,
}: {
    event: Event
    mini?: boolean
    disabled?: boolean
    onClick: () => void
}) {
    const { bg, hover, text } = colorsFor(event)
    const base = `flex w-full items-center gap-1 overflow-hidden rounded-md px-1.5 text-left ${bg} ${text} ${mini ? 'min-h-0 flex-1' : 'h-full'}`
    const isBirthday = event._id.startsWith('birthday-')
    const title = (
        <>
            {isBirthday && (
                <i className="fa-solid fa-cake-candles shrink-0 text-[9px] opacity-70" />
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
    if (disabled) {
        return (
            <div title={event.title} className={`${base} opacity-50`}>
                {title}
            </div>
        )
    }
    return (
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
}: EventStackProps) {
    if (events.length === 0) {
        if (disabled) return <div className="h-full w-full" />
        return (
            <button
                type="button"
                onClick={onAdd}
                className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
            >
                <i className="fa-solid fa-plus text-[10px] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
        )
    }

    if (events.length === 1) {
        return (
            <Chip event={events[0]} disabled={disabled} onClick={() => onEventClick(events[0])} />
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
                    />
                ))
            )}
        </div>
    )
}
