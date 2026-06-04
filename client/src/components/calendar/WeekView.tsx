import { PERIODS, WEEKDAYS_LONG, addDays, getWeekStart, parseDateKey, eventCoversSlot, isPartPast, todayKey } from '../../lib/calendar'
import { EVENT_TYPE_COLORS, NA_EVENT_COLORS, DAY_STATUS_OPTIONS } from '../../types'
import type { Event, DayStatus, Part } from '../../types'

interface Props {
    focusDate: string
    events: Event[]
    statuses: DayStatus[]
    today: Date
    onOpenDay: (date: string) => void
    onOpenPart: (date: string, part: Part) => void
    onEventClick: (event: Event) => void
}

const CELL_H = 'h-20'

export default function WeekView({ focusDate, events, statuses, today, onOpenDay, onOpenPart, onEventClick }: Props) {
    const tk = todayKey()
    const weekStart = getWeekStart(focusDate)
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

    return (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    {/* Day headers */}
                    <thead>
                        <tr className="border-b border-neutral-200">
                            <th className="sticky left-0 z-10 w-28 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Period
                            </th>
                            {weekDays.map((date) => {
                                const { day } = parseDateKey(date)
                                const weekday = new Date(date + 'T00:00:00').getDay()
                                const isToday = date === tk
                                const isPast = date < tk
                                return (
                                    <th key={date} className={['px-1 py-2 text-center', isPast ? 'bg-red-50/40' : ''].join(' ')}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenDay(date)}
                                            className={[
                                                'mx-auto flex flex-col items-center justify-center rounded-lg px-3 py-1.5 transition-colors',
                                                isToday ? 'bg-neutral-950 text-white' : 'text-neutral-700 hover:bg-neutral-100',
                                            ].join(' ')}
                                        >
                                            <span className={`text-[10px] font-semibold uppercase leading-none ${isToday ? 'text-white/70' : 'text-neutral-400'}`}>
                                                {WEEKDAYS_LONG[weekday].slice(0, 3)}
                                            </span>
                                            <span className="mt-0.5 text-lg font-bold leading-none tabular-nums">{day}</span>
                                        </button>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        {/* Period rows */}
                        {PERIODS.map((period) => (
                            <tr key={period.key} className="border-b border-neutral-100">
                                <th scope="row" className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                        <i className={`${period.icon} w-4 text-center text-neutral-400`} aria-hidden="true" />
                                        {period.label}
                                    </span>
                                </th>
                                {weekDays.map((date) => {
                                    const weekday = new Date(date + 'T00:00:00').getDay()
                                    const weekend = weekday === 0 || weekday === 6
                                    const past = isPartPast(date, period.key, today)
                                    const event = events.find((e) => eventCoversSlot(e, date, period.key)) ?? null
                                    const hasAllDay = !event && events.some((e) => e.allDay && date >= e.startDate && date <= e.endDate)
                                    return (
                                        <td
                                            key={date}
                                            className={[
                                                `${CELL_H} border-l border-neutral-100 p-0.5 align-top`,
                                                past ? 'bg-red-100/60' : hasAllDay ? 'bg-neutral-100/70' : weekend ? 'bg-neutral-100/60' : '',
                                            ].join(' ')}
                                        >
                                            <WeekCell
                                                event={event}
                                                past={past}
                                                onClick={event ? () => onEventClick(event) : () => onOpenPart(date, period.key)}
                                            />
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}

                        {/* Other row */}
                        <tr className="border-t-2 border-neutral-200">
                            <th scope="row" className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle">
                                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                    <i className="fa-solid fa-ellipsis w-4 text-center text-neutral-400" aria-hidden="true" />
                                    Other
                                </span>
                            </th>
                            {weekDays.map((date) => {
                                const weekday = new Date(date + 'T00:00:00').getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const event = events.find((e) => e.startPart === 'na' && date >= e.startDate && date <= e.endDate) ?? null
                                const pastDay = date < tk
                                return (
                                    <td
                                        key={date}
                                        className={[`${CELL_H} border-l border-neutral-100 p-0.5 align-top`, weekend ? 'bg-neutral-100/60' : ''].join(' ')}
                                    >
                                        <WeekCell
                                            event={event}
                                            past={false}
                                            disabled={pastDay && !event}
                                            onClick={event ? () => onEventClick(event) : () => onOpenPart(date, 'na')}
                                        />
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Leave row */}
                        <tr className="border-t-2 border-neutral-200">
                            <th scope="row" className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle">
                                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                    <i className="fa-solid fa-umbrella-beach w-4 text-center text-neutral-400" aria-hidden="true" />
                                    Leave
                                </span>
                            </th>
                            {weekDays.map((date) => {
                                const weekday = new Date(date + 'T00:00:00').getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const status = statuses.find((s) => s.startDate <= date && s.endDate >= date) ?? null
                                const colors = status ? DAY_STATUS_OPTIONS.find((o) => o.value === status.status) : null
                                return (
                                    <td
                                        key={date}
                                        className={[`${CELL_H} border-l border-neutral-100 p-0.5 align-top`, weekend ? 'bg-neutral-100/60' : ''].join(' ')}
                                    >
                                        {status && colors ? (
                                            <button
                                                type="button"
                                                onClick={() => onOpenDay(date)}
                                                title={colors.label}
                                                className={`flex h-full w-full items-center overflow-hidden rounded-lg px-2 text-left transition-colors ${colors.bg} ${colors.hover} ${colors.text}`}
                                            >
                                                <span className="truncate text-xs font-semibold">{colors.label}</span>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onOpenDay(date)}
                                                className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100"
                                            >
                                                <i className="fa-solid fa-plus text-[10px] opacity-0 group-hover:opacity-100" />
                                            </button>
                                        )}
                                    </td>
                                )
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function WeekCell({
    event,
    past,
    disabled = false,
    onClick,
}: {
    event: Event | null
    past: boolean
    disabled?: boolean
    onClick: () => void
}) {
    if (!event) {
        if (disabled || past) return <div className="h-full w-full" />
        return (
            <button
                type="button"
                onClick={onClick}
                className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
            >
                <i className="fa-solid fa-plus text-[10px] opacity-0 group-hover:opacity-100" />
            </button>
        )
    }
    const { bg, hover, text } = event.startPart === 'na' ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[event.eventType]
    return (
        <button
            type="button"
            onClick={onClick}
            title={event.title}
            className={`flex h-full w-full flex-col justify-start overflow-hidden rounded-lg px-2 py-1.5 text-left transition-colors ${bg} ${hover}`}
        >
            {event.time && <span className={`text-[10px] font-medium tabular-nums ${text} opacity-70`}>{event.time}</span>}
            <span className={`truncate text-xs font-semibold ${text}`}>{event.title}</span>
            {event.recurrence && (
                <span className={`text-[9px] font-medium ${text} opacity-60`}>
                    <i className="fa-solid fa-repeat mr-1" />recurring
                </span>
            )}
        </button>
    )
}
