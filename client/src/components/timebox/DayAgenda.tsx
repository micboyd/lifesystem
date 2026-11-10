import { CATEGORY_STYLE } from './timeboxStyles'
import type { AgendaRow, PlanSuggestion } from '../../lib/timebox'
import { formatDuration, minutesToTime } from '../../lib/time'
import type { Timebox } from '../../types'

interface Props {
    rows: AgendaRow[]
    /** Minutes since midnight when the day shown is today, else null. */
    nowMin: number | null
    onOpen: (item: Timebox) => void
    onFill: (start: number, end: number) => void
    /** Tap a working-hours row to box a task inside it. */
    onWork: (start: number, end: number) => void
    /** Tap the lunch break to box it. */
    onLunch: (start: number, end: number) => void
    onPlan: (s: PlanSuggestion) => void
}

/** Taller for longer blocks, within reason, so the day keeps its shape. */
const heightFor = (min: number) => Math.round(Math.min(168, Math.max(56, min * 0.9)))

/**
 * The day top to bottom in bold colour: solid blocks with white text, dashed
 * outlines for planned training and meals not boxed yet, and dashed "free"
 * rows for the gaps. Tap a block to edit it, a gap or plan to fill it.
 */
export default function DayAgenda({ rows, nowMin, onOpen, onFill, onWork, onLunch, onPlan }: Props) {
    return (
        <ol className="flex flex-col gap-2">
            {rows.map((row) => (
                <li key={row.key} className="flex gap-3 sm:gap-4">
                    <span className="w-11 shrink-0 pt-3 text-right text-[13px] font-medium nums text-neutral-500">
                        {row.kind === 'free' ? '' : minutesToTime(row.start)}
                    </span>
                    <div className="min-w-0 flex-1">
                        {row.kind === 'block' ? (
                            <Block row={row} nowMin={nowMin} onOpen={onOpen} />
                        ) : row.kind === 'work' ? (
                            <Work row={row} nowMin={nowMin} onWork={onWork} />
                        ) : row.kind === 'lunch' ? (
                            <button
                                type="button"
                                onClick={() => onLunch(row.start, row.end)}
                                className="flex h-11 w-full items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-sky-300 bg-white/40 px-4 text-left text-[13px] font-semibold text-sky-800 transition-colors hover:border-sky-400 hover:bg-white/70"
                            >
                                <i className="fa-solid fa-utensils text-[11px]" aria-hidden="true" />
                                Lunch · {formatDuration(row.end - row.start)}
                                <span className="ml-auto text-xs font-normal nums text-sky-700/70">
                                    {minutesToTime(row.start)}–{minutesToTime(row.end)}
                                </span>
                            </button>
                        ) : row.kind === 'planned' ? (
                            <Planned row={row} onPlan={onPlan} />
                        ) : (
                            <button
                                type="button"
                                onClick={() => onFill(row.start, row.end)}
                                className="flex h-11 w-full items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-neutral-300 px-4 text-left text-[13px] font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:bg-white/60 hover:text-neutral-800"
                            >
                                <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                                {formatDuration(row.end - row.start)} free
                                <span className="ml-auto text-xs font-normal nums text-neutral-400">
                                    {minutesToTime(row.start)}–{minutesToTime(row.end)}
                                </span>
                            </button>
                        )}
                    </div>
                </li>
            ))}
        </ol>
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
    const { item, start, end } = row
    const len = end - start
    const running = nowMin !== null && start <= nowMin && nowMin < end
    const past = nowMin !== null && end <= nowMin
    const sub = running
        ? `Now · ${formatDuration(end - nowMin!)} left`
        : `${minutesToTime(start)}–${minutesToTime(end)} · ${formatDuration(len)}`

    return (
        <button
            type="button"
            onClick={() => onOpen(item)}
            style={{ minHeight: heightFor(len) }}
            className={[
                'flex w-full flex-col justify-center rounded-2xl px-4 py-2.5 text-left text-white transition-[opacity,transform] active:scale-[0.99]',
                CATEGORY_STYLE[item.category ?? 'none'].solid,
                running ? 'ring-[3px] ring-coral-500 ring-offset-2 ring-offset-canvas' : '',
                past ? 'opacity-45 hover:opacity-70' : 'hover:opacity-90',
            ].join(' ')}
        >
            <span className="flex items-center gap-2 text-[15px] font-semibold leading-snug">
                <span className="min-w-0 truncate">{item.title}</span>
                {item.recurrence && <i className="fa-solid fa-repeat text-[11px] text-white/70" aria-label="Repeats" />}
                {item.source && <i className="fa-solid fa-video text-[11px] text-white/70" aria-label="From Google Calendar" />}
            </span>
            <span className="mt-0.5 text-[13px] nums text-white/80">{sub}</span>
            {item.notes && len >= 60 && <span className="mt-1.5 line-clamp-2 text-[13px] text-white/75">{item.notes}</span>}
        </button>
    )
}

/**
 * Working hours not given to a specific block: the work colour, softer than a
 * real block so the boxed tasks inside it still stand out.
 */
function Work({
    row,
    nowMin,
    onWork,
}: {
    row: Extract<AgendaRow, { kind: 'work' }>
    nowMin: number | null
    onWork: (start: number, end: number) => void
}) {
    const { start, end } = row
    const running = nowMin !== null && start <= nowMin && nowMin < end
    const past = nowMin !== null && end <= nowMin
    const sub = running
        ? `Now · ${formatDuration(end - nowMin!)} left`
        : `${minutesToTime(start)}–${minutesToTime(end)} · ${formatDuration(end - start)}`
    return (
        <button
            type="button"
            onClick={() => onWork(start, end)}
            style={{ minHeight: heightFor(end - start) }}
            className={[
                'group flex w-full flex-col justify-center rounded-2xl bg-sky-100 px-4 py-2.5 text-left text-sky-900 transition-[opacity,background-color] hover:bg-sky-200/80',
                running ? 'ring-[3px] ring-coral-500 ring-offset-2 ring-offset-canvas' : '',
                past ? 'opacity-50' : '',
            ].join(' ')}
        >
            <span className="flex items-center gap-2 text-[15px] font-semibold leading-snug">
                <i className="fa-solid fa-briefcase text-[12px] text-sky-700" aria-hidden="true" />
                Work
                <span className="ml-auto text-[13px] font-medium text-sky-700 opacity-0 transition-opacity group-hover:opacity-100">
                    <i className="fa-solid fa-plus mr-1 text-[11px]" aria-hidden="true" />
                    Box a task
                </span>
            </span>
            <span className="mt-0.5 text-[13px] nums text-sky-800/80">{sub}</span>
        </button>
    )
}

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
            className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed px-4 py-2.5 text-left transition-colors hover:bg-white/60 ${CATEGORY_STYLE[s.category].outline}`}
        >
            <i className={`fa-solid ${s.kind === 'training' ? 'fa-dumbbell' : 'fa-bowl-food'} text-sm opacity-70`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold leading-snug">{s.title}</span>
                <span className="block truncate text-[13px] opacity-75">Planned · {s.detail}</span>
            </span>
            <span className="shrink-0 text-[13px] font-medium">
                <i className="fa-solid fa-plus mr-1 text-[11px]" aria-hidden="true" />
                Add
            </span>
        </button>
    )
}
