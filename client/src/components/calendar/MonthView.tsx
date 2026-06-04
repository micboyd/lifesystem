import { todayKey, addDays, getWeekStart, parseDateKey } from '../../lib/calendar'
import { EVENT_TYPE_COLORS, NA_EVENT_COLORS, DAY_STATUS_OPTIONS } from '../../types'
import type { Event, DayStatus, Part } from '../../types'

interface Props {
    focusDate: string
    events: Event[]
    statuses: DayStatus[]
    onOpenDay: (date: string) => void
    /** Accepted for a shared prop shape with the other views; unused here. */
    onOpenPart?: (date: string, part: Part) => void
    onEventClick: (event: Event) => void
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE = 3

export default function MonthView({ focusDate, events, statuses, onOpenDay, onEventClick }: Props) {
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
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
                {WEEKDAY_HEADERS.map((d) => (
                    <div key={d} className="py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-neutral-400">
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
                    const isWeekend = [0, 6].includes(new Date(date + 'T00:00:00').getDay())
                    const status = statuses.find((s) => s.startDate <= date && s.endDate >= date) ?? null
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

                    return (
                        <div
                            key={date}
                            onClick={() => onOpenDay(date)}
                            className={[
                                'min-h-28 cursor-pointer p-1.5 transition-colors hover:bg-neutral-50',
                                !isCurrentMonth ? 'bg-neutral-50/60' : '',
                                isPast && isCurrentMonth ? 'bg-red-50/40' : '',
                                isWeekend && isCurrentMonth && !isPast ? 'bg-neutral-50/40' : '',
                            ].join(' ')}
                        >
                            {/* Leave bar */}
                            {status && (() => {
                                const opt = DAY_STATUS_OPTIONS.find((o) => o.value === status.status)!
                                return <div className={`mb-1 h-1 w-full rounded-full ${opt.bg.replace('-100', '-400')}`} />
                            })()}

                            {/* Day number */}
                            <div className="mb-1 flex justify-end">
                                <span className={[
                                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                                    isToday ? 'bg-neutral-950 text-white' : isCurrentMonth ? 'text-neutral-700' : 'text-neutral-300',
                                ].join(' ')}>
                                    {dayNum}
                                </span>
                            </div>

                            {/* Event chips */}
                            <div className="flex flex-col gap-0.5">
                                {visible.map((e) => {
                                    const colors = e.startPart === 'na' ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[e.eventType]
                                    return (
                                        <button
                                            key={e._id + date}
                                            type="button"
                                            onClick={(ev) => { ev.stopPropagation(); onEventClick(e) }}
                                            className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold transition-colors ${colors.bg} ${colors.text} ${colors.hover}`}
                                        >
                                            {e.recurrence && <i className="fa-solid fa-repeat text-[8px] shrink-0 opacity-60" />}
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
        </div>
    )
}
