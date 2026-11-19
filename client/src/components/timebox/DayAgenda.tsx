import {
    createContext,
    useContext,
    useState,
    type ContextType,
    type DragEvent,
    type MouseEvent,
    type ReactNode,
} from 'react'
import Tooltip from '../Tooltip'
import { CATEGORY_STYLE } from './timeboxStyles'
import {
    clashGroups,
    clashesWith,
    inLunch,
    landingFor,
    type AgendaRow,
    type PlanSuggestion,
    type WorkWindow,
} from '../../lib/timebox'
import { formatDuration, minutesToTime, timeToMinutes } from '../../lib/time'
import type { Timebox } from '../../types'

interface Props {
    rows: AgendaRow[]
    /** The day's working hours, to flag meetings in the lunch break. */
    work: WorkWindow | null
    /** Minutes since midnight when the day shown is today, else null. */
    nowMin: number | null
    onOpen: (item: Timebox) => void
    onFill: (start: number, end: number) => void
    /** Tap a working-hours row to box a task inside it. */
    onWork: (start: number, end: number) => void
    /** Tap a meeting listed inside a work row. */
    onOpenMeeting: (item: Timebox) => void
    /** Tap the lunch break to box it. */
    onLunch: (start: number, end: number) => void
    onPlan: (s: PlanSuggestion) => void
    /**
     * Right-click. `row` is the row under the pointer (null for an item listed
     * inside a work / lunch row); `item` is the block or meeting, when there is one.
     */
    onMenu?: (e: MouseEvent, row: AgendaRow | null, item?: Timebox) => void
    /** A block of your own was dragged to land at `startMin`. */
    onMove?: (item: Timebox, startMin: number) => void
}

/** What rows deeper down need to open the menu on an item, or start dragging one. */
const ActionsContext = createContext<{
    itemMenu?: (e: MouseEvent, item: Timebox) => void
    dragStart: (e: DragEvent, item: Timebox) => void
    dragEnd: () => void
}>({ dragStart: () => {}, dragEnd: () => {} })

/** Only your own blocks move; meetings come from Google and stay put. */
const movable = (item: Timebox) => !item.source

/** A little taller for longer blocks, so the day keeps some shape without sprawling. */
const heightFor = (min: number) => Math.round(Math.min(104, Math.max(0, min * 0.45)))

/**
 * The day top to bottom as one open list on the page, rows divided by hairlines:
 * the start time on the left, a slim colour rule for the category, the title in
 * ink and the times in grey. Meetings, and everything in the lunch break, are
 * listed under the row that holds them; items that clash sit side by side with a
 * small warning. Free time is a quiet line you can tap to fill.
 */
export default function DayAgenda({
    rows,
    work,
    nowMin,
    onOpen,
    onFill,
    onWork,
    onOpenMeeting,
    onLunch,
    onPlan,
    onMenu,
    onMove,
}: Props) {
    const [dragging, setDragging] = useState<Timebox | null>(null)
    const [over, setOver] = useState<string | null>(null)

    const dragStart = (e: DragEvent, item: Timebox) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.title)
        setDragging(item)
    }
    const dragEnd = () => {
        setDragging(null)
        setOver(null)
    }

    return (
        <ActionsContext.Provider
            value={{
                itemMenu: onMenu ? (e, item) => onMenu(e, null, item) : undefined,
                dragStart,
                dragEnd,
            }}
        >
            <ol className="divide-y divide-hairline border-y border-hairline">
                {rows.map((row) => {
                    const { running } = timing(row.start, row.end, nowMin)
                    const own = row.kind === 'block' && movable(row.item) ? row.item : null
                    const isDragged = !!dragging && row.kind === 'block' && row.item === dragging
                    const target = !!dragging && !isDragged && over === row.key
                    const lands = landingFor(row)
                    return (
                        <li
                            key={row.key}
                            draggable={!!own && !!onMove}
                            onDragStart={own ? (e) => dragStart(e, own) : undefined}
                            onDragEnd={dragEnd}
                            onDragOver={(e) => {
                                if (!dragging || isDragged) return
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                if (over !== row.key) setOver(row.key)
                            }}
                            onDragLeave={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                                    setOver(null)
                            }}
                            onDrop={(e) => {
                                e.preventDefault()
                                if (dragging && !isDragged) onMove?.(dragging, lands)
                                dragEnd()
                            }}
                            onContextMenu={
                                onMenu
                                    ? (e) => {
                                          e.preventDefault()
                                          onMenu(
                                              e,
                                              row,
                                              row.kind === 'block' ? row.item : undefined
                                          )
                                      }
                                    : undefined
                            }
                            className={[
                                'relative flex gap-4 sm:gap-6',
                                row.kind === 'free' ? 'py-1' : 'py-3.5',
                                own && onMove ? 'md:cursor-grab md:active:cursor-grabbing' : '',
                                isDragged ? 'opacity-40' : '',
                                target ? 'bg-coral-50/50' : '',
                            ].join(' ')}
                        >
                            {target && (
                                <span
                                    className={`pointer-events-none absolute inset-x-0 z-10 flex items-center gap-2 ${
                                        row.kind === 'block' ? '-bottom-px' : '-top-px'
                                    }`}
                                    aria-hidden="true"
                                >
                                    <span className="h-0.5 flex-1 bg-coral-500" />
                                    <span className="-my-2 rounded-md bg-coral-500 px-1.5 py-0.5 text-[11px] font-medium nums text-white">
                                        Move to {minutesToTime(lands)}
                                    </span>
                                </span>
                            )}
                            <span
                                className={`w-11 shrink-0 text-[13px] nums ${row.kind === 'free' ? '' : 'pt-px'} ${
                                    running ? 'font-medium text-coral-600' : 'text-neutral-500'
                                }`}
                            >
                                {row.kind === 'free' ? '' : minutesToTime(row.start)}
                            </span>
                            <div
                                className={`min-w-0 flex-1 ${
                                    row.kind === 'block' && row.during
                                        ? 'border-l-2 border-amber-300 pl-3 sm:pl-4'
                                        : ''
                                }`}
                            >
                                {row.kind === 'block' ? (
                                    <Block row={row} nowMin={nowMin} onOpen={onOpen} />
                                ) : row.kind === 'work' ? (
                                    <Work
                                        row={row}
                                        nowMin={nowMin}
                                        onWork={onWork}
                                        onOpenMeeting={onOpenMeeting}
                                        work={work}
                                    />
                                ) : row.kind === 'lunch' ? (
                                    <Lunch
                                        row={row}
                                        nowMin={nowMin}
                                        onLunch={onLunch}
                                        onOpenMeeting={onOpenMeeting}
                                        work={work}
                                    />
                                ) : row.kind === 'planned' ? (
                                    <Planned row={row} onPlan={onPlan} />
                                ) : (
                                    <Free start={row.start} end={row.end} onFill={onFill} />
                                )}
                            </div>
                        </li>
                    )
                })}
            </ol>
        </ActionsContext.Provider>
    )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function timing(start: number, end: number, nowMin: number | null) {
    return {
        running: nowMin !== null && start <= nowMin && nowMin < end,
        past: nowMin !== null && end <= nowMin,
    }
}

/** "Now · 25m left" — the only colour a running row gets. */
function NowPill({ end, nowMin }: { end: number; nowMin: number }) {
    return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-coral-50 px-2 py-0.5 text-[11px] font-semibold text-coral-700">
            <span className="h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden="true" />
            Now · {formatDuration(end - nowMin)} left
        </span>
    )
}

/**
 * The shape every row kind shares: a slim colour rule down the left (solid for
 * your blocks, dashed for things not boxed yet), a tappable header, and an
 * optional list underneath. No surface: the hairlines between rows do the work.
 */
function Card({
    bar,
    dashed = false,
    past,
    minHeight,
    header,
    children,
}: {
    bar?: string
    dashed?: boolean
    running?: boolean
    past: boolean
    minHeight?: number
    header: ReactNode
    children?: ReactNode
}) {
    return (
        <div
            style={minHeight ? { minHeight } : undefined}
            className={`flex gap-3 transition-opacity ${past ? 'opacity-50' : ''}`}
        >
            {bar && (
                <span
                    className={`shrink-0 rounded-full ${dashed ? `border-l-2 border-dashed ${bar}` : `w-[3px] ${bar}`}`}
                    aria-hidden="true"
                />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
                {header}
                {children}
            </div>
        </div>
    )
}

/** The header line of a row: title and a grey time line, as one button. */
function Header({
    title,
    icons,
    meta,
    right,
    onClick,
    hint,
}: {
    title: ReactNode
    icons?: ReactNode
    meta: ReactNode
    right?: ReactNode
    onClick: () => void
    /** Shown on hover at the right, e.g. "Box a task". */
    hint?: string
}) {
    return (
        <div className="flex items-start gap-2">
            <button
                type="button"
                onClick={onClick}
                className="group flex min-w-0 flex-1 flex-col gap-0.5 text-left"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-[15px] font-medium leading-snug text-neutral-900 decoration-neutral-300 underline-offset-4 group-hover:underline">
                        {title}
                    </span>
                    {icons}
                    {hint && (
                        <span className="ml-auto shrink-0 text-[12px] font-medium text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100">
                            <i className="fa-solid fa-plus mr-1 text-[10px]" aria-hidden="true" />
                            {hint}
                        </span>
                    )}
                </span>
                <span className="text-[13px] nums text-neutral-500">{meta}</span>
            </button>
            {right}
        </div>
    )
}

function Block({
    row,
    nowMin,
    onOpen,
}: {
    row: Extract<AgendaRow, { kind: 'block' }>
    nowMin: number | null
    onOpen: (item: Timebox) => void
}) {
    const { item, start, end, during } = row
    const { running, past } = timing(start, end, nowMin)
    return (
        <Card
            bar={
                item.source ? CATEGORY_STYLE.work.bar : CATEGORY_STYLE[item.category ?? 'none'].bar
            }
            running={running}
            past={past}
            minHeight={during ? undefined : heightFor(end - start)}
            header={
                <Header
                    onClick={() => onOpen(item)}
                    title={item.title}
                    icons={
                        <>
                            {item.recurrence && (
                                <i
                                    className="fa-solid fa-repeat text-[10px] text-neutral-300"
                                    aria-label="Repeats"
                                />
                            )}
                            {item.source && (
                                <i
                                    className="fa-solid fa-video text-[10px] text-neutral-400"
                                    aria-label="From Google Calendar"
                                />
                            )}
                        </>
                    }
                    meta={
                        <>
                            {minutesToTime(start)} – {minutesToTime(end)}
                            <span className="text-neutral-400">
                                {' '}
                                · {formatDuration(end - start)}
                            </span>
                            {/* A meeting's description stays in its drawer. */}
                            {item.notes && !item.source && end - start >= 60 && (
                                <span className="mt-1 line-clamp-1 text-neutral-400">
                                    {item.notes}
                                </span>
                            )}
                        </>
                    }
                    right={
                        <>
                            {running && nowMin !== null && <NowPill end={end} nowMin={nowMin} />}
                            {item.joinUrl && <JoinButton href={item.joinUrl} />}
                        </>
                    }
                />
            }
        >
            {during && (
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-amber-700">
                    <i className="fa-solid fa-layer-group text-[10px]" aria-hidden="true" />
                    <span className="truncate">During {during}</span>
                </p>
            )}
        </Card>
    )
}

/** Working hours no block of your own covers — a pale sky rule, meetings listed under it. */
function Work({
    row,
    nowMin,
    onWork,
    onOpenMeeting,
    work,
}: {
    row: Extract<AgendaRow, { kind: 'work' }>
    nowMin: number | null
    onWork: (start: number, end: number) => void
    onOpenMeeting: (item: Timebox) => void
    work: WorkWindow | null
}) {
    const { start, end, meetings } = row
    const { running, past } = timing(start, end, nowMin)
    return (
        <Card
            bar="bg-sky-200"
            running={running}
            past={past}
            minHeight={meetings.length ? undefined : heightFor(end - start)}
            header={
                <Header
                    onClick={() => onWork(start, end)}
                    hint="Box a task"
                    title={
                        <span className="flex items-center gap-2">
                            <i
                                className="fa-solid fa-briefcase text-[11px] text-sky-500"
                                aria-hidden="true"
                            />
                            <span className="text-neutral-600">Work</span>
                        </span>
                    }
                    meta={
                        <>
                            {minutesToTime(start)} – {minutesToTime(end)}
                            <span className="text-neutral-400">
                                {' '}
                                · {formatDuration(end - start)}
                            </span>
                        </>
                    }
                    right={
                        running && nowMin !== null ? (
                            <NowPill end={end} nowMin={nowMin} />
                        ) : undefined
                    }
                />
            }
        >
            <SubItems items={meetings} nowMin={nowMin} onOpen={onOpenMeeting} work={work} />
        </Card>
    )
}

/** The lunch break: everything that starts in it is listed inside. */
function Lunch({
    row,
    nowMin,
    onLunch,
    onOpenMeeting,
    work,
}: {
    row: Extract<AgendaRow, { kind: 'lunch' }>
    nowMin: number | null
    onLunch: (start: number, end: number) => void
    onOpenMeeting: (item: Timebox) => void
    work: WorkWindow | null
}) {
    const { start, end, items } = row
    const { running, past } = timing(start, end, nowMin)
    return (
        <Card
            bar="border-amber-300"
            dashed
            running={running}
            past={past}
            header={
                <Header
                    onClick={() => onLunch(start, end)}
                    hint={items.length ? undefined : 'Box lunch'}
                    title={
                        <span className="flex items-center gap-2">
                            <i
                                className="fa-solid fa-utensils text-[11px] text-amber-500"
                                aria-hidden="true"
                            />
                            <span className="text-neutral-600">Lunch break</span>
                        </span>
                    }
                    meta={
                        <>
                            {minutesToTime(start)} – {minutesToTime(end)}
                            <span className="text-neutral-400">
                                {' '}
                                · {formatDuration(end - start)}
                            </span>
                        </>
                    }
                    right={
                        running && nowMin !== null ? (
                            <NowPill end={end} nowMin={nowMin} />
                        ) : undefined
                    }
                />
            }
        >
            <SubItems items={items} nowMin={nowMin} onOpen={onOpenMeeting} work={work} />
        </Card>
    )
}

/**
 * The items under a row: one quiet line each, time then title. Items that
 * overlap sit side by side, each with an amber rule down its left; each
 * clashing item, and each meeting in the lunch break, carries a small warning
 * icon whose tooltip says why.
 */
function SubItems({
    items,
    nowMin,
    onOpen,
    work,
}: {
    items: Timebox[]
    nowMin: number | null
    onOpen: (item: Timebox) => void
    work: WorkWindow | null
}) {
    if (!items.length) return null
    return (
        <ul className="mt-2 flex flex-col gap-0.5">
            {clashGroups(items).map((group) => {
                const warningsFor = (m: Timebox) => [
                    ...(m.source && inLunch(m, work) ? ['In your lunch break'] : []),
                    ...(group.length > 1
                        ? [
                              `Clashes with ${clashesWith(m, group)
                                  .map((o) => o.title)
                                  .join(', ')}`,
                          ]
                        : []),
                ]
                if (group.length === 1)
                    return (
                        <li key={group[0]._id}>
                            <SubLine
                                item={group[0]}
                                nowMin={nowMin}
                                onOpen={onOpen}
                                warnings={warningsFor(group[0])}
                            />
                        </li>
                    )
                return (
                    <li
                        key={group.map((g) => g._id).join('|')}
                        className="grid gap-1.5 py-1"
                        style={{ gridTemplateColumns: `repeat(${group.length}, minmax(0, 1fr))` }}
                    >
                        {group.map((m) => (
                            <SubTile
                                key={m._id}
                                item={m}
                                nowMin={nowMin}
                                onOpen={onOpen}
                                warnings={warningsFor(m)}
                            />
                        ))}
                    </li>
                )
            })}
        </ul>
    )
}

/** Right-click and drag for one item listed inside a row. */
function itemHandlers(actions: ContextType<typeof ActionsContext>, item: Timebox) {
    return {
        onContextMenu: actions.itemMenu
            ? (e: MouseEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  actions.itemMenu!(e, item)
              }
            : undefined,
        draggable: movable(item),
        onDragStart: movable(item) ? (e: DragEvent) => actions.dragStart(e, item) : undefined,
        onDragEnd: actions.dragEnd,
    }
}

/** A meeting's video icon, or your own block's category dot. */
function Marker({ item }: { item: Timebox }) {
    return item.source ? (
        <i
            className="fa-solid fa-video w-2 shrink-0 text-center text-[9px] text-sky-500"
            aria-hidden="true"
        />
    ) : (
        <span
            className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_STYLE[item.category ?? 'none'].dot}`}
            aria-hidden="true"
        />
    )
}

function Warning({ warnings }: { warnings: string[] }) {
    if (!warnings.length) return null
    return (
        <Tooltip content={warnings.join(' · ')}>
            <i
                className="fa-solid fa-triangle-exclamation shrink-0 text-[11px] text-amber-500"
                role="img"
                aria-label={warnings.join('. ')}
            />
        </Tooltip>
    )
}

function SubLine({
    item,
    nowMin,
    onOpen,
    warnings,
}: {
    item: Timebox
    nowMin: number | null
    onOpen: (item: Timebox) => void
    warnings: string[]
}) {
    const { running, past } = timing(
        timeToMinutes(item.startTime),
        timeToMinutes(item.endTime),
        nowMin
    )
    const actions = useContext(ActionsContext)
    return (
        <div
            {...itemHandlers(actions, item)}
            className={`-mx-1.5 flex items-center gap-2 rounded-md transition-colors hover:bg-surface-muted ${past ? 'opacity-50' : ''}`}
        >
            <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-w-0 flex-1 items-center gap-3 px-1.5 py-1.5 text-left"
            >
                <span
                    className={`w-[5.75rem] shrink-0 text-[13px] nums ${running ? 'font-semibold text-coral-600' : 'text-neutral-500'}`}
                >
                    {item.startTime} – {item.endTime}
                </span>
                <Marker item={item} />
                <span className="min-w-0 truncate text-[14px] font-medium text-neutral-900">
                    {item.title}
                </span>
                <Warning warnings={warnings} />
            </button>
            {item.joinUrl && <JoinButton href={item.joinUrl} />}
        </div>
    )
}

/** One of several clashing items, side by side: time over title beside an amber rule. */
function SubTile({
    item,
    nowMin,
    onOpen,
    warnings,
}: {
    item: Timebox
    nowMin: number | null
    onOpen: (item: Timebox) => void
    warnings: string[]
}) {
    const { running, past } = timing(
        timeToMinutes(item.startTime),
        timeToMinutes(item.endTime),
        nowMin
    )
    const actions = useContext(ActionsContext)
    return (
        <div
            {...itemHandlers(actions, item)}
            className={`flex min-w-0 items-center gap-1.5 border-l-2 border-amber-300 pr-1.5 transition-colors hover:bg-surface-muted ${past ? 'opacity-50' : ''}`}
        >
            <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-1.5 text-left"
            >
                <span
                    className={`flex items-center gap-1.5 text-[12px] nums ${running ? 'font-semibold text-coral-600' : 'text-neutral-500'}`}
                >
                    <Marker item={item} />
                    {item.startTime} – {item.endTime}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-[13px] text-neutral-800">
                        {item.title}
                    </span>
                    <Warning warnings={warnings} />
                </span>
            </button>
            {item.joinUrl && <JoinButton href={item.joinUrl} compact />}
        </div>
    )
}

/** Opens the meeting's video call in a new tab. */
function JoinButton({ href, compact = false }: { href: string; compact?: boolean }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Join the call"
            className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-hairline text-[12px] font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-white ${
                compact ? 'w-7 justify-center' : 'px-2.5'
            }`}
        >
            <i className="fa-solid fa-video text-[10px]" aria-hidden="true" />
            {!compact && 'Join'}
        </a>
    )
}

/** Unclaimed time: a quiet line of grey text you can tap to fill. */
function Free({
    start,
    end,
    onFill,
}: {
    start: number
    end: number
    onFill: (start: number, end: number) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onFill(start, end)}
            className="group flex h-9 w-full items-center gap-2 text-left text-[13px] nums text-neutral-400 transition-colors hover:text-neutral-900"
        >
            <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
            <span>
                {formatDuration(end - start)} free
                <span className="text-neutral-300 group-hover:text-neutral-400">
                    {' '}
                    · {minutesToTime(start)} – {minutesToTime(end)}
                </span>
            </span>
        </button>
    )
}

/** A planned meal not boxed yet: a dashed rule to tap and add. */
function Planned({
    row,
    onPlan,
}: {
    row: Extract<AgendaRow, { kind: 'planned' }>
    onPlan: (s: PlanSuggestion) => void
}) {
    const s = row.suggestion
    return (
        <button
            type="button"
            onClick={() => onPlan(s)}
            className="group flex w-full gap-3 text-left"
        >
            <span
                className={`shrink-0 rounded-full border-l-2 border-dashed ${CATEGORY_STYLE[s.category].outline}`}
                aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-snug text-neutral-600 group-hover:text-neutral-900">
                    {s.title}
                </span>
                <span className="block truncate text-[13px] text-neutral-500">
                    <i
                        className="fa-solid fa-bowl-food mr-1.5 text-[11px] text-neutral-400"
                        aria-hidden="true"
                    />
                    Planned · {s.detail}
                </span>
            </span>
            <span className="shrink-0 self-center text-[13px] font-medium text-neutral-500 group-hover:text-neutral-900">
                <i className="fa-solid fa-plus mr-1 text-[11px]" aria-hidden="true" />
                Add
            </span>
        </button>
    )
}
