import { useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Checkbox from '../Checkbox'
import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import { HeroIconButton } from './WeekPlannerUI'
import { parseDateKey, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'

/**
 * The day-card parts both week planners (Fitness and Nutrition) are built
 * from, so the two look and behave the same: slots with a + and room to drop,
 * planned rows that open, tick and drag, the empty slot tile, the ⋯ menus,
 * the "copied" banners and the copy-week drawer, plus the add drawer's
 * segmented switch and list rows.
 */

// ─── Menus ────────────────────────────────────────────────────────────────────

/** The week's ⋯ menu in the hero: copy, paste, clear and the like. */
export function HeroMenu({ items }: { items: MenuEntry[] }) {
    return (
        <div className="ml-auto">
            <DropdownMenu
                align="right"
                size="medium"
                items={items}
                trigger={<HeroIconButton icon="fa-solid fa-ellipsis" label="Week options" onClick={() => {}} />}
            />
        </div>
    )
}

/** A day card's ⋯ menu. */
export function DayMenu({ label, items }: { label: string; items: MenuEntry[] }) {
    return (
        <DropdownMenu
            align="right"
            items={items}
            trigger={
                <button
                    type="button"
                    aria-label={label}
                    title="Day options"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-ellipsis text-[13px]" aria-hidden="true" />
                </button>
            }
        />
    )
}

// ─── Day card title ───────────────────────────────────────────────────────────

/**
 * One line: weekday, date, "Today", anything the planner adds (a flag), then
 * the day's buttons pushed right. Negative margin on the buttons so they
 * never make the line taller than the title.
 */
export function DayTitle({
    date,
    compact = false,
    isToday,
    children,
    actions,
}: {
    date: string
    compact?: boolean
    isToday: boolean
    children?: ReactNode
    actions?: ReactNode
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={`font-semibold tracking-tight text-neutral-900 ${compact ? 'text-base' : 'text-lg'}`}>
                {compact ? weekday.slice(0, 3) : weekday}
            </h3>
            <span className="text-sm text-neutral-500">
                {day} {compact ? MONTHS[month].slice(0, 3) : MONTHS[month]}
            </span>
            {isToday && <span className="text-sm font-medium text-coral-600">Today</span>}
            {children}
            {actions && <div className="-my-1.5 ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
    )
}

// ─── Slots ────────────────────────────────────────────────────────────────────

/** Where a dragged row would land in a slot: before `refId`, or at the end (null). */
export type SlotDrop = { refId: string | null; after: boolean }

/**
 * One slot of a day (breakfast, morning…): its name and a + beside its rows —
 * or over them in a board column. The whole slot is one drop target while
 * something's being dragged, and a right-click on it opens `onContextMenu`.
 */
export function PlanSlot({
    compact = false,
    marker,
    label,
    empty,
    onAdd,
    onContextMenu,
    dragActive,
    draggedId,
    drop,
    onTarget,
    onClearTarget,
    onDrop,
    children,
}: {
    compact?: boolean
    /** A dot or icon before the slot's name. */
    marker: ReactNode
    label: string
    /** Nothing in the slot: the empty tile shows instead of the rows. */
    empty: boolean
    onAdd: () => void
    onContextMenu?: (ev: MouseEvent) => void
    dragActive: boolean
    draggedId: string | null
    drop: SlotDrop | null
    onTarget: (refId: string | null, after: boolean) => void
    onClearTarget: () => void
    onDrop: () => void
    /** The slot's `PlanRow`s. */
    children?: ReactNode
}) {
    const listRef = useRef<HTMLUListElement>(null)
    const addLabel = `Add to ${label.toLowerCase()}`

    // The insertion point comes from the cursor's Y against each row's
    // midpoint, skipping the row in flight — one continuous target, no seams.
    const targetForY = (clientY: number): SlotDrop => {
        const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-plan-row]')
        if (rows) {
            for (const row of Array.from(rows)) {
                const id = row.getAttribute('data-plan-row')
                if (id === draggedId) continue
                const rect = row.getBoundingClientRect()
                if (clientY < rect.top + rect.height / 2) return { refId: id, after: false }
            }
        }
        return { refId: null, after: false }
    }

    const dropProps = dragActive
        ? {
              onDragOver: (e: DragEvent) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const t = targetForY(e.clientY)
                  onTarget(t.refId, t.after)
              },
              onDragLeave: (e: DragEvent) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) onClearTarget()
              },
              onDrop: (e: DragEvent) => {
                  e.preventDefault()
                  onDrop()
              },
          }
        : {}

    return (
        <div
            {...dropProps}
            onContextMenu={
                onContextMenu &&
                ((ev) => {
                    ev.preventDefault()
                    onContextMenu(ev)
                })
            }
            className={`${
                compact
                    ? 'flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0'
                    : // Phones: the slot's name over its rows, so rows get the full width.
                      'flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start sm:gap-3'
            } ${drop ? '-mx-1.5 rounded-xl bg-coral-50 px-1.5 ring-2 ring-inset ring-coral-200' : ''}`}
        >
            <div className={`flex items-center justify-between gap-2 ${compact ? '' : 'sm:flex-col sm:items-start sm:pt-1.5'}`}>
                <span className="flex items-center gap-2">
                    {marker}
                    <span className="text-[13px] font-medium text-neutral-500">{label}</span>
                </span>
                <button
                    type="button"
                    onClick={onAdd}
                    aria-label={addLabel}
                    title={addLabel}
                    className={`grid shrink-0 place-items-center rounded-full text-neutral-500 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-900 hover:text-white hover:ring-neutral-900 ${
                        compact ? 'h-6 w-6' : 'h-9 w-9 sm:h-8 sm:w-8'
                    }`}
                >
                    <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                </button>
            </div>
            {!empty ? (
                <ul ref={listRef} className={compact ? 'flex flex-col gap-1.5' : 'grid gap-2 sm:grid-cols-2 2xl:grid-cols-3'}>
                    {children}
                    {drop && drop.refId === null && <DropLine />}
                </ul>
            ) : (
                <button type="button" onClick={onAdd} className="group block w-full text-left">
                    <EmptySlotTile
                        compact={compact}
                        active={dragActive}
                        title={dragActive ? 'Move here' : 'Nothing yet'}
                        detail={dragActive ? 'Drop to move it' : 'Tap to add'}
                    />
                </button>
            )}
        </div>
    )
}

/** A slot with nothing in it, built like a planned row so it stands as tall as one. */
export function EmptySlotTile({
    compact = false,
    active = false,
    title,
    detail,
}: {
    compact?: boolean
    /** A drag is in flight and this slot would take it. */
    active?: boolean
    title: string
    detail: string
}) {
    return (
        <span
            className={`flex items-center rounded-xl outline-1 -outline-offset-1 outline-dashed transition-colors ${
                compact ? 'p-2' : 'px-2.5 py-2'
            } ${
                active
                    ? 'bg-coral-50 text-coral-600 outline-coral-300'
                    : 'text-neutral-400 outline-neutral-200 group-hover:text-neutral-600 group-hover:outline-neutral-300'
            }`}
        >
            <span className="flex min-w-0 items-stretch gap-2.5">
                <span className="w-1 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 py-0.5">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    <span className="mt-0.5 block truncate text-[13px] opacity-80">{detail}</span>
                </span>
            </span>
        </span>
    )
}

/** The coral marker showing where a dragged row will drop within a slot. */
export function DropLine() {
    return <li aria-hidden="true" className="h-0.5 rounded-full bg-coral-500" />
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

/**
 * A planned row: a coloured bar, its name and one line under it, opening for
 * a closer look. `trailing` holds the tick (or whatever stands in for it).
 * Rows drag to another slot or day on a wide screen.
 */
export function PlanRow({
    compact = false,
    bar,
    title,
    titleTone = 'text-neutral-900',
    meta,
    name,
    onOpen,
    trailing,
    draggable = false,
    lane = draggable,
    onDragStart,
    onDragEnd,
    dropId,
    dropEdge = null,
    onContextMenu,
}: {
    compact?: boolean
    /** The bar's colour class. */
    bar: string
    title: ReactNode
    /** The name's colour (and any strike-through). */
    titleTone?: string
    meta: ReactNode
    /** For "View …" on the open button. */
    name: string
    onOpen?: () => void
    trailing?: ReactNode
    draggable?: boolean
    /** Sits in a slot lane, so it stands off it in white. */
    lane?: boolean
    onDragStart?: () => void
    onDragEnd?: () => void
    /** Marks the row for its slot's drop targeting (`data-plan-row`). */
    dropId?: string
    /** Which edge to mark as the pending drop spot — an overlay, so the row never shifts. */
    dropEdge?: 'top' | 'bottom' | null
    /** Right-click on the row. */
    onContextMenu?: (ev: MouseEvent) => void
}) {
    const [dragging, setDragging] = useState(false)

    const body = (
        <span className="flex min-w-0 items-stretch gap-2.5">
            <span className={`w-1 shrink-0 rounded-full ${bar}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 py-0.5">
                <span className={`block truncate font-medium ${compact ? 'text-sm' : 'text-[15px] sm:text-sm'} ${titleTone}`}>
                    {title}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-neutral-500">{meta}</span>
            </span>
        </span>
    )

    return (
        <li
            draggable={draggable}
            onDragStart={
                draggable
                    ? (e: DragEvent) => {
                          // A payload is required for the drag to start in Firefox.
                          e.dataTransfer.setData('text/plain', dropId ?? '')
                          e.dataTransfer.effectAllowed = 'move'
                          setDragging(true)
                          onDragStart?.()
                      }
                    : undefined
            }
            onDragEnd={
                draggable
                    ? () => {
                          setDragging(false)
                          onDragEnd?.()
                      }
                    : undefined
            }
            data-plan-row={dropId}
            onContextMenu={onContextMenu}
            className={`group relative flex items-center rounded-xl transition-colors ${
                compact ? 'gap-1 p-2' : 'min-h-14 gap-2 px-3 py-2 sm:min-h-0 sm:px-2.5'
            } ${lane ? 'bg-white ring-1 ring-neutral-900/[0.06]' : 'bg-neutral-50'} ${
                onOpen ? (lane ? 'hover:ring-neutral-900/[0.12]' : 'hover:bg-neutral-100') : ''
            } ${draggable ? 'md:cursor-grab md:active:cursor-grabbing' : ''} ${dragging ? 'opacity-40' : ''}`}
        >
            {dropEdge && (
                <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-coral-500 ${
                        dropEdge === 'top' ? '-top-[5px]' : '-bottom-[5px]'
                    }`}
                />
            )}
            {draggable && !compact && (
                // Drag-and-drop is a mouse thing — no grip on touch screens.
                <i
                    className="fa-solid fa-grip-vertical hidden shrink-0 pl-1 text-[11px] text-neutral-300 md:invisible md:inline md:group-hover:visible"
                    aria-hidden="true"
                />
            )}
            {onOpen ? (
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={`View ${name}`}
                    className="min-w-0 flex-1 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                >
                    {body}
                </button>
            ) : (
                <div className="min-w-0 flex-1">{body}</div>
            )}
            {trailing}
        </li>
    )
}

/** The size of a row's round trailing button: a thumb's width on a phone. */
export const rowButtonSize = (compact: boolean) => (compact ? 'h-6 w-6' : 'h-10 w-10 sm:h-8 sm:w-8')

/** The row's tick: done (green), or a hairline circle waiting to be tapped. */
export function RowTick({
    done,
    compact = false,
    label,
    title,
    onClick,
}: {
    done: boolean
    compact?: boolean
    /** For screen readers: what pressing it does. */
    label: string
    title: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            aria-pressed={done}
            aria-label={label}
            title={title}
            onClick={onClick}
            className={`grid shrink-0 place-items-center rounded-full transition-colors ${rowButtonSize(compact)} ${
                done
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    : 'bg-white text-neutral-300 ring-1 ring-inset ring-neutral-200 hover:text-emerald-600 hover:ring-emerald-300'
            }`}
        >
            <i className="fa-solid fa-check text-[11px]" aria-hidden="true" />
        </button>
    )
}

// ─── Copied banners ───────────────────────────────────────────────────────────

/** A copied week waiting to be pasted: where it came from, Paste here, and forget it. */
export function WeekClipboardBanner({
    what,
    fromLabel,
    sameWeek,
    onPaste,
    onForget,
}: {
    /** What was copied, e.g. "lunch + dinner". */
    what: string
    /** The week it came from, e.g. "20 – 26 Oct". */
    fromLabel: string
    /** The week on show is the one copied, so there's nowhere to paste. */
    sameWeek: boolean
    onPaste: () => void
    onForget: () => void
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm text-white">
            <i className="fa-solid fa-copy text-xs text-white/60" aria-hidden="true" />
            <span className="min-w-0 flex-1">
                Copied {what} from {fromLabel}
                {sameWeek && <span className="text-white/60"> — go to another week to paste</span>}
            </span>
            {!sameWeek && (
                <button
                    type="button"
                    onClick={onPaste}
                    className="h-8 rounded-full bg-white px-3 text-[13px] font-semibold text-neutral-900"
                >
                    Paste here
                </button>
            )}
            <button
                type="button"
                aria-label="Forget the copied week"
                onClick={onForget}
                className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
        </div>
    )
}

/** One copied item waiting to be pasted into a slot. */
export function CopiedBanner({
    name,
    forgetLabel,
    onForget,
}: {
    name: string
    forgetLabel: string
    onForget: () => void
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-2 text-[13px] text-neutral-700">
            <i className="fa-solid fa-paste text-xs text-neutral-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-neutral-900">{name}</span> copied — right-click a slot, or tap +, to
                paste it
            </span>
            <button
                type="button"
                aria-label={forgetLabel}
                onClick={onForget}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-white hover:text-neutral-900"
            >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
        </div>
    )
}

// ─── Copy week ────────────────────────────────────────────────────────────────

/** Copy this week's plan — all of it, or just some — to paste onto another week. */
export function CopyWeekDrawer<T extends string>({
    open,
    weekLabel,
    options,
    describe,
    hint,
    onClose,
    onCopy,
}: {
    open: boolean
    weekLabel: string
    /** What can be copied, in order. */
    options: { value: T; label: string }[]
    /** A short lower-case name for a choice, e.g. "lunch + dinner" or "everything". */
    describe: (chosen: T[]) => string
    hint: string
    onClose: () => void
    onCopy: (chosen: T[]) => void
}) {
    const [selected, setSelected] = useState<Set<T>>(() => new Set(options.map((o) => o.value)))
    const chosen = options.map((o) => o.value).filter((v) => selected.has(v))

    function toggle(value: T) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(value)) next.delete(value)
            else next.add(value)
            return next
        })
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title="Copy week"
            badge={weekLabel}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        icon="fa-solid fa-copy"
                        disabled={chosen.length === 0}
                        onClick={() => chosen.length > 0 && onCopy(chosen)}
                    >
                        Copy {chosen.length ? describe(chosen) : ''}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-500">{hint}</p>
                <div className="flex flex-col gap-0.5">
                    {options.map((o) => (
                        <Checkbox
                            key={o.value}
                            checked={selected.has(o.value)}
                            onChange={() => toggle(o.value)}
                            label={o.label}
                            className="rounded-lg px-1.5 py-2 hover:bg-neutral-50"
                        />
                    ))}
                </div>
            </div>
        </Drawer>
    )
}

// ─── Add drawer pieces ────────────────────────────────────────────────────────

/** A small segmented switch — the add drawer's slot and type pickers. */
export function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T
    options: [T, string][]
    onChange: (v: T) => void
}) {
    return (
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    aria-pressed={v === value}
                    onClick={() => onChange(v)}
                    className={`h-8 rounded-[9px] px-3 text-[13px] font-medium transition-all ${
                        v === value
                            ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.04]'
                            : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}

/** One thing to pick in the add drawer: its name, a line under it, and what tapping does. */
export function PickRow({
    title,
    detail,
    icon,
    disabled,
    onClick,
}: {
    title: string
    detail: string
    icon: string
    disabled?: boolean
    onClick: () => void
}) {
    return (
        <li>
            <button
                type="button"
                disabled={disabled}
                onClick={onClick}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-800">{title}</span>
                    <span className="block truncate text-xs tabular-nums text-neutral-500">{detail}</span>
                </span>
                <i className={`${icon} shrink-0 text-xs text-neutral-500`} aria-hidden="true" />
            </button>
        </li>
    )
}

/** The small uppercase label over each section of the add drawer. */
export const PICK_LABEL = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'
