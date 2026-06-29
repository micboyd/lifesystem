import { todayKey, addDays, getWeekStart, parseDateKey } from '../../lib/calendar'
import { EVENT_TYPE_COLORS, NA_EVENT_COLORS, DAY_STATUS_OPTIONS } from '../../types'
import type { Event, DayStatus, Part, Reminder } from '../../types'
import { Card } from '../Card'
import ReminderChip from '../reminders/ReminderChip'

interface Props {
    focusDate: string
    events: Event[]
    statuses: DayStatus[]
    reminders: Reminder[]
    onOpenDay: (date: string) => void
    /** Accepted for a shared prop shape with the other views; unused here. */
    onOpenPart?: (date: string, part: Part) => void
    onOpenReminders: (date: string) => void
    onEventClick: (event: Event) => void
    onCreateEvent?: (date: string) => void
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE = 3

export default function MonthView({
    focusDate,
    events,
    statuses,
    reminders,
    onOpenDay,
    onOpenReminders,
    onEventClick,
    onCreateEvent,
}: Props) {
    const tk = todayKey()
    const { year, month } = parseDateKey(focusDate)

    // Build the grid: start from the Sunday of the week containing the 1st
    const firstOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const gridStart = getWeekStart(firstOfMonth)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDow = new Date(year, month, 1).getDay()
    const totalCells = firstDow + daysInMonth > 35 ? 42 : 35
    const gridDays = Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i))

    return (
        <Card flush hover={false} className="overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-neutral-200 bg-white">
                {WEEKDAY_HEADERS.map((d) => (
                    <div
                        key={d}
                        className="py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-neutral-400"
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-neutral-100">
                {gridDays.map((date) => {
                    const { month: cellMonth } = parseDateKey(date)
                    const isCurrentMonth = cellMonth === month
                    const isToday = date === tk
                    const isPast = date < tk
                    const status =
                        statuses.find((s) => s.startDate <= date && s.endDate >= date) ?? null
                    const dayNum = parseInt(date.slice(8))

                    // All events touching this date (deduped by _id)
                    const seen = new Set<string>()
                    const dayEvents = events.filter((e) => {
                        if (date < e.startDate || date > e.endDate) return false
                        if (seen.has(e._id)) return false
                        seen.add(e._id)
                        return true
                    })

                    const visible = dayEvents.slice(0, MAX_VISIBLE)
                    const overflow = dayEvents.length - MAX_VISIBLE

                    const dayReminders = reminders.filter((r) => r.date === date)

                    return (
                        <div
                            key={date}
                            onClick={() => onCreateEvent?.(date)}
                            className={[
                                'group/cell min-h-28 cursor-pointer p-1.5 transition-colors hover:bg-neutral-50',
                                !isCurrentMonth ? 'bg-neutral-50/60' : '',
                                isPast && isCurrentMonth ? 'bg-red-50/40' : '',
                            ].join(' ')}
                        >
                            {/* Leave bar */}
                            {status &&
                                (() => {
                                    const opt = DAY_STATUS_OPTIONS.find(
                                        (o) => o.value === status.status
                                    )!
                                    return (
                                        <div
                                            className={`mb-1 h-1 w-full rounded-full ${opt.bg.replace('-100', '-400')}`}
                                        />
                                    )
                                })()}

                            {/* Header: reminder affordance (left) + day number (right) */}
                            <div className="mb-1 flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={(ev) => {
                                        ev.stopPropagation()
                                        onOpenReminders(date)
                                    }}
                                    aria-label="Reminders"
                                    title={
                                        dayReminders.length
                                            ? dayReminders.map((r) => r.text).join('\n')
                                            : 'Add reminder'
                                    }
                                    className={[
                                        'grid h-6 w-6 place-items-center rounded-full text-xs transition-colors hover:bg-amber-100',
                                        dayReminders.length
                                            ? 'text-amber-500'
                                            : 'text-neutral-300 opacity-0 group-hover/cell:opacity-100',
                                    ].join(' ')}
                                >
                                    <i className="fa-solid fa-bell text-[11px]" aria-hidden="true" />
                                    {dayReminders.length > 1 && (
                                        <span className="ml-0.5 text-[9px] font-bold">
                                            {dayReminders.length}
                                        </span>
                                    )}
                                </button>
                                <span
                                    onClick={(ev) => {
                                        ev.stopPropagation()
                                        onOpenDay(date)
                                    }}
                                    className={[
                                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold hover:ring-2 hover:ring-neutral-400',
                                        isToday
                                            ? 'bg-neutral-950 text-white'
                                            : isCurrentMonth
                                              ? 'text-neutral-700'
                                              : 'text-neutral-300',
                                    ].join(' ')}
                                >
                                    {dayNum}
                                </span>
                            </div>

                            {/* Reminder chips */}
                            {dayReminders.length > 0 && (
                                <div className="mb-0.5">
                                    <ReminderChip
                                        reminders={dayReminders}
                                        onOpen={() => onOpenReminders(date)}
                                    />
                                </div>
                            )}

                            {/* Event chips */}
                            <div className="flex flex-col gap-0.5">
                                {visible.map((e) => {
                                    const colors =
                                        e.startPart === 'na'
                                            ? NA_EVENT_COLORS
                                            : EVENT_TYPE_COLORS[e.eventType]
                                    return (
                                        <button
                                            key={e._id + date}
                                            type="button"
                                            onClick={(ev) => {
                                                ev.stopPropagation()
                                                onEventClick(e)
                                            }}
                                            className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold transition-colors ${colors.bg} ${colors.text} ${colors.hover}`}
                                        >
                                            {e.recurrence && (
                                                <i className="fa-solid fa-repeat text-[8px] shrink-0 opacity-60" />
                                            )}
                                            <span className="truncate">{e.title}</span>
                                        </button>
                                    )
                                })}
                                {overflow > 0 && (
                                    <span className="px-1.5 text-[11px] font-semibold text-neutral-400">
                                        +{overflow} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}
