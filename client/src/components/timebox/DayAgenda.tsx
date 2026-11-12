import type { ReactNode } from 'react'
import Tooltip from '../Tooltip'
import { CATEGORY_STYLE } from './timeboxStyles'
import {
    clashGroups,
    clashesWith,
    inLunch,
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
}

/** A little taller for longer blocks, so the day keeps some shape without sprawling. */
const heightFor = (min: number) => Math.round(Math.min(132, Math.max(60, min * 0.55)))

/**
 * The day top to bottom as quiet cards on the canvas: a thin colour bar for the
 * category, the title in ink and the times in grey. Meetings, and everything in
 * the lunch break, are listed inside the card that holds them; items that clash
 * sit side by side with a small warning. Free time is a light dashed line.
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
}: Props) {
    return (
        <ol className="flex flex-col gap-2.5">
            {rows.map((row) => (
                <li key={row.key} className="flex gap-3 sm:gap-4">
                    <span className="w-11 shrink-0 pt-3.5 text-right text-[12px] font-medium nums text-neutral-400">
                        {row.kind === 'free' ? '' : minutesToTime(row.start)}
                    </span>
                    <div className="min-w-0 flex-1">
                        {row.kind === 'block' ? (
                            <Block row={row} nowMin={nowMin} onOpen={onOpen} work={work} />
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
            ))}
        </ol>
    )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function timing(start: number, end: number, nowMin: number | null) {
    return {
        running: nowMin !== null && start <= nowMin && nowMin < end,
        past: nowMin !== null && end <= nowMin,
    }
}

/** "Now · 25m left" — the only colour a running card gets. */
function NowPill({ end, nowMin }: { end: number; nowMin: number }) {
    return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-coral-50 px-2 py-0.5 text-[11px] font-semibold text-coral-700">
            <span className="h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden="true" />
            Now · {formatDuration(end - nowMin)} left
        </span>
    )
}

/**
 * The card every row kind shares: a rounded surface with an optional colour bar
 * down the left, a tappable header, and an optional list underneath.
 */
function Card({
    bar,
    tone = 'plain',
    running,
    past,
    minHeight,
    header,
    children,
}: {
    bar?: string
    tone?: 'plain' | 'work'
    running: boolean
    past: boolean
    minHeight?: number
    header: ReactNode
    children?: ReactNode
}) {
    return (
        <div
            style={minHeight ? { minHeight } : undefined}
            className={[
                'flex overflow-hidden rounded-2xl ring-1 transition-opacity',
                tone === 'work'
                    ? 'bg-sky-50/70'
                    : 'bg-white shadow-[0_1px_2px_rgba(26,25,23,0.04)]',
                running
                    ? 'ring-coral-300'
                    : tone === 'work'
                      ? 'ring-sky-100'
                      : 'ring-neutral-900/[0.06]',
                past ? 'opacity-55' : '',
            ].join(' ')}
        >
            {bar && <span className={`w-1 shrink-0 ${bar}`} aria-hidden="true" />}
            <div className="flex min-w-0 flex-1 flex-col justify-center">
                {header}
                {children}
            </div>
        </div>
    )
}

/** The header line of a card: title row and a grey time line, as one button. */
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
        <div className="flex items-center gap-2 pr-3">
            <button
                type="button"
                onClick={onClick}
                className="group flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-[15px] font-medium leading-snug text-neutral-900">
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
    work,
}: {
    row: Extract<AgendaRow, { kind: 'block' }>
    nowMin: number | null
    onOpen: (item: Timebox) => void
    work: WorkWindow | null
}) {
    const { item, start, end, meetings } = row
    const { running, past } = timing(start, end, nowMin)
    return (
        <Card
            bar={
                item.source ? CATEGORY_STYLE.work.bar : CATEGORY_STYLE[item.category ?? 'none'].bar
            }
            running={running}
            past={past}
            minHeight={meetings.length ? undefined : heightFor(end - start)}
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
            <SubItems items={meetings} nowMin={nowMin} onOpen={onOpen} work={work} />
        </Card>
    )
}

/** Working hours no block of your own covers — a soft blue card, meetings inside. */
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
            tone="work"
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
                            Work
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
            bar="bg-amber-300"
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
                            Lunch break
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
 * The items inside a card, under a hairline: one quiet line each, time then
 * title. Items that overlap sit side by side as small amber-edged tiles; each
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
        <ul className="mx-3 mb-2 flex flex-col gap-0.5 border-t border-neutral-900/[0.06] pt-1.5">
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
    return (
        <div
            className={`flex items-center gap-2 rounded-lg transition-colors hover:bg-neutral-900/[0.03] ${past ? 'opacity-50' : ''}`}
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
                <span className="min-w-0 truncate text-[14px] text-neutral-800">{item.title}</span>
                <Warning warnings={warnings} />
            </button>
            {item.joinUrl && <JoinButton href={item.joinUrl} />}
        </div>
    )
}

/** One of several clashing items, side by side: time over title on a soft amber tile. */
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
    return (
        <div
            className={`flex min-w-0 items-center gap-1.5 rounded-lg bg-amber-50/70 pr-1.5 ring-1 ring-inset ring-amber-200/70 ${past ? 'opacity-50' : ''}`}
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
            className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-sky-50 text-[12px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 transition-colors hover:bg-sky-100 ${
                compact ? 'w-7 justify-center' : 'px-2.5'
            }`}
        >
            <i className="fa-solid fa-video text-[10px]" aria-hidden="true" />
            {!compact && 'Join'}
        </a>
    )
}

/** Unclaimed time: a light dashed line you can tap to fill. */
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
            className="group flex h-10 w-full items-center gap-3 rounded-xl px-2 text-left text-[13px] text-neutral-400 transition-colors hover:bg-white/70 hover:text-neutral-700"
        >
            <span
                className="h-px flex-1 border-t border-dashed border-neutral-300 group-hover:border-neutral-400"
                aria-hidden="true"
            />
            <span className="flex shrink-0 items-center gap-1.5 nums">
                <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                {formatDuration(end - start)} free
                <span className="text-neutral-300">·</span>
                {minutesToTime(start)} – {minutesToTime(end)}
            </span>
            <span
                className="h-px w-6 border-t border-dashed border-neutral-300 group-hover:border-neutral-400"
                aria-hidden="true"
            />
        </button>
    )
}

/** A planned meal not boxed yet: a dashed outline to tap and add. */
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
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-neutral-300 px-4 py-2.5 text-left transition-colors hover:border-neutral-400 hover:bg-white/70"
        >
            <span
                className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_STYLE[s.category].dot}`}
                aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-snug text-neutral-800">
                    {s.title}
                </span>
                <span className="block truncate text-[13px] text-neutral-500">
                    <i
                        className={`fa-solid fa-bowl-food mr-1.5 text-[11px] text-neutral-400`}
                        aria-hidden="true"
                    />
                    Planned · {s.detail}
                </span>
            </span>
            <span className="shrink-0 text-[13px] font-medium text-neutral-600">
                <i className="fa-solid fa-plus mr-1 text-[11px]" aria-hidden="true" />
                Add
            </span>
        </button>
    )
}
