import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useCalendars } from '../../context/CalendarsContext'
import { colorsForEvent } from '../../lib/eventColors'
import ContextMenu from '../ContextMenu'
import type { MenuItem } from '../DropdownMenu'
import type { Event } from '../../types'

interface EventStackProps {
    events: Event[]
    /**
     * Slot lies in the past: nothing new can be added or pasted here, but the
     * events already in it stay open-able so they can be viewed or deleted.
     */
    past?: boolean
    onEventClick: (event: Event) => void
    onAdd: () => void
    onPick: (events: Event[]) => void
    /** Copy this event to the calendar's paste buffer. */
    onCopyEvent?: (event: Event) => void
    /** Delete this event (the caller handles confirmation / recurrence scope). */
    onDeleteEvent?: (event: Event) => void
    /** Paste the buffered event into this slot (date/part already bound). */
    onPaste?: () => void
    /** Whether a copied event is available to paste. */
    canPaste?: boolean
    /**
     * Narrow cells (Year view): only the types that need telling apart at a
     * glance keep their icon, so the title isn't squeezed out.
     */
    compact?: boolean
    /** The slot this stack fills: an event carried on from an earlier slot shows its colour but not its name again. */
    date?: string
    part?: string
}

/** Whether an event started in an earlier slot than this one. */
function continues(event: Event, date?: string, part?: string): boolean {
    if (!date) return false
    if (date > event.startDate) return true
    return date === event.startDate && !!part && part !== 'na' && event.startPart !== part
}

function Chip({
    event,
    mini = false,
    muted = false,
    hideLabel = false,
    onClick,
    onContextMenu,
}: {
    event: Event
    mini?: boolean
    /** Dim the chip (a past slot) — it stays clickable. */
    muted?: boolean
    compact?: boolean
    /** A continuation of a longer event: colour only. */
    hideLabel?: boolean
    onClick: () => void
    onContextMenu?: (e: ReactMouseEvent) => void
}) {
    const { byId } = useCalendars()
    const { bg, hover, text } = colorsForEvent(event, byId)
    const sizing = mini ? 'min-h-0 flex-1' : 'h-full'
    return (
        <div className={`group/chip relative ${sizing}`} onContextMenu={onContextMenu}>
            <button
                type="button"
                title={event.title}
                aria-label={event.title}
                onClick={(e) => {
                    e.stopPropagation()
                    onClick()
                }}
                className={`flex h-full w-full items-center overflow-hidden px-1.5 py-[3px] text-left ${bg} ${text} ${hover} transition ${
                    muted ? 'opacity-50 hover:opacity-100' : ''
                }`}
            >
                {!hideLabel && (
                    <span lang="en-GB" className="line-clamp-2 text-[11px] font-medium leading-[1.15] [hyphens:auto]">
                        {event.title}
                    </span>
                )}
            </button>
            {event.alcohol && !hideLabel && (
                <i
                    className="fa-solid fa-beer-mug-empty pointer-events-none absolute right-1 top-1 z-[1] text-[12px] leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                    aria-label="Drinking"
                />
            )}
        </div>
    )
}

/**
 * Renders the event(s) occupying a single calendar slot.
 * - 0 events: an "add" affordance.
 * - 1 event: a full-height chip.
 * - 2 events: two stacked half-height chips (both titles visible).
 * - 3+ events: the first chip plus a "+N more" that opens a picker.
 *
 * Right-clicking a chip opens a context menu to copy or delete it (and paste,
 * when a copied event is available); right-clicking an empty slot offers paste.
 */
export default function EventStack({
    events,
    past = false,
    onEventClick,
    onAdd,
    onPick,
    onCopyEvent,
    onDeleteEvent,
    onPaste,
    canPaste = false,
    compact = false,
    date,
    part,
}: EventStackProps) {
    // Cursor-anchored menu; `event` is null when opened over an empty slot.
    const [menu, setMenu] = useState<{ x: number; y: number; event: Event | null } | null>(null)

    const canDelete = (event: Event | null) => !!event && !!onDeleteEvent

    function openMenu(e: ReactMouseEvent, event: Event | null) {
        const canCopy = !!event && !!onCopyEvent
        const canPasteHere = canPaste && !!onPaste
        // Nothing to offer — let the browser's native menu through.
        if (!canCopy && !canPasteHere && !canDelete(event)) return
        e.preventDefault()
        e.stopPropagation()
        setMenu({ x: e.clientX, y: e.clientY, event })
    }

    const menuItems: MenuItem[] = menu
        ? [
              ...(menu.event && onCopyEvent
                  ? [
                        {
                            label: 'Copy event',
                            icon: 'fa-solid fa-copy',
                            onClick: () => onCopyEvent(menu.event!),
                        },
                    ]
                  : []),
              ...(canPaste && onPaste
                  ? [{ label: 'Paste event', icon: 'fa-solid fa-paste', onClick: onPaste }]
                  : []),
              ...(canDelete(menu.event)
                  ? [
                        {
                            label: 'Delete event',
                            icon: 'fa-solid fa-trash',
                            danger: true,
                            onClick: () => onDeleteEvent!(menu.event!),
                        },
                    ]
                  : []),
          ]
        : []

    const contextMenu =
        menu && menuItems.length > 0 ? (
            <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
        ) : null

    if (events.length === 0) {
        if (past) return <div className="h-full w-full cursor-not-allowed" title="This has passed — open an event to view or change it" />
        return (
            <>
                <button
                    type="button"
                    onClick={onAdd}
                    onContextMenu={(e) => openMenu(e, null)}
                    title={canPaste ? 'Right-click to paste event' : undefined}
                    className="group grid h-full w-full place-items-center text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-plus text-[11px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
                </button>
                {contextMenu}
            </>
        )
    }

    if (events.length === 1) {
        return (
            <>
                <Chip
                    compact={compact}
                    event={events[0]}
                    hideLabel={continues(events[0], date, part)}
                    muted={past}
                    onClick={() => onEventClick(events[0])}
                    onContextMenu={(e) => openMenu(e, events[0])}
                />
                {contextMenu}
            </>
        )
    }

    const overflow = events.length > 2
    return (
        <div className="flex h-full w-full flex-col gap-0.5">
            {overflow ? (
                <>
                    <Chip
                        compact={compact}
                        event={events[0]}
                        mini
                        muted={past}
                        onClick={() => onEventClick(events[0])}
                        onContextMenu={(e) => openMenu(e, events[0])}
                    />
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            onPick(events)
                        }}
                        onContextMenu={(e) => openMenu(e, null)}
                        className={`flex min-h-0 flex-1 items-center justify-center bg-neutral-100 text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 ${past ? 'opacity-50 hover:opacity-100' : ''}`}
                    >
                        +{events.length - 1} more
                    </button>
                </>
            ) : (
                events.map((e) => (
                    <Chip
                        compact={compact}
                        key={e._id}
                        event={e}
                        mini
                        muted={past}
                        onClick={() => onEventClick(e)}
                        onContextMenu={(ev) => openMenu(ev, e)}
                    />
                ))
            )}
            {contextMenu}
        </div>
    )
}
