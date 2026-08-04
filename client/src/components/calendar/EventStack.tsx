import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { EVENT_TYPE_ICONS } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { colorsForEvent } from '../../lib/eventColors'
import ContextMenu from '../ContextMenu'
import type { MenuItem } from '../DropdownMenu'
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

function Chip({
    event,
    mini = false,
    disabled = false,
    onClick,
    onContextMenu,
}: {
    event: Event
    mini?: boolean
    disabled?: boolean
    onClick: () => void
    onContextMenu?: (e: ReactMouseEvent) => void
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
        <div className={`group/chip relative ${sizing}`} onContextMenu={onContextMenu}>
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
 * Right-clicking a chip opens a context menu to copy it (and paste, when a
 * copied event is available); right-clicking an empty slot offers paste.
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
    // Cursor-anchored menu; `event` is null when opened over an empty slot.
    const [menu, setMenu] = useState<{ x: number; y: number; event: Event | null } | null>(null)

    function openMenu(e: ReactMouseEvent, event: Event | null) {
        const canCopy = !!event && !!onCopyEvent
        const canPasteHere = canPaste && !!onPaste
        // Nothing to offer — let the browser's native menu through.
        if (!canCopy && !canPasteHere) return
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
          ]
        : []

    const contextMenu =
        menu && menuItems.length > 0 ? (
            <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
        ) : null

    if (events.length === 0) {
        if (disabled) return <div className="h-full w-full" />
        return (
            <>
                <button
                    type="button"
                    onClick={onAdd}
                    onContextMenu={(e) => openMenu(e, null)}
                    title={canPaste ? 'Right-click to paste event' : undefined}
                    className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
                >
                    <i className="fa-solid fa-plus text-[10px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
                </button>
                {contextMenu}
            </>
        )
    }

    if (events.length === 1) {
        return (
            <>
                <Chip
                    event={events[0]}
                    disabled={disabled}
                    onClick={() => onEventClick(events[0])}
                    onContextMenu={(e) => openMenu(e, events[0])}
                />
                {contextMenu}
            </>
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
                        onContextMenu={(e) => openMenu(e, events[0])}
                    />
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={(e) => {
                            e.stopPropagation()
                            onPick(events)
                        }}
                        onContextMenu={(e) => openMenu(e, null)}
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
                        onContextMenu={(ev) => openMenu(ev, e)}
                    />
                ))
            )}
            {contextMenu}
        </div>
    )
}
