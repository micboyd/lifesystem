import type { ScheduleDay, ScheduleItem } from '../../lib/cleaning'
import { DAY_LONG } from '../../lib/cleaning'
import { formatDuration } from '../../lib/time'
import { MONTHS } from '../../lib/calendar'

/** "19 Nov" */
function shortDate(date: string) {
    const [, m, d] = date.split('-').map(Number)
    return `${d} ${MONTHS[m - 1].slice(0, 3)}`
}

/** One week of cleaning: a card per cleaning day with its jobs, room by room. */
export default function WeekGrid({
    week,
    dates,
    today,
}: {
    week: ScheduleDay[]
    /** The date each weekday falls on in the week shown (0 = Sun … 6 = Sat). */
    dates?: Record<number, string>
    today?: string
}) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            {week.map((day) => (
                <DayCard key={day.dow} day={day} date={dates?.[day.dow]} isToday={!!today && dates?.[day.dow] === today} />
            ))}
        </div>
    )
}

function DayCard({ day, date, isToday }: { day: ScheduleDay; date?: string; isToday: boolean }) {
    const over = day.total > day.capacity
    const pct = Math.min(100, (day.total / day.capacity) * 100)
    const groups: { room: string; items: ScheduleItem[] }[] = []
    for (const item of day.items) {
        const last = groups[groups.length - 1]
        if (last && last.room === item.roomName) last.items.push(item)
        else groups.push({ room: item.roomName, items: [item] })
    }

    return (
        <article
            className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ${
                isToday ? 'ring-2 ring-area-cleaning/50' : 'ring-neutral-900/[0.06]'
            }`}
        >
            <header className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-[15px] font-medium text-neutral-950">{DAY_LONG[day.dow]}</h3>
                    {isToday ? (
                        <span className="shrink-0 rounded-full bg-area-cleaning-bg px-2 py-0.5 text-[11px] font-medium text-area-cleaning">
                            Today
                        </span>
                    ) : (
                        date && <span className="shrink-0 text-[12px] nums text-neutral-500">{shortDate(date)}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                        <div
                            className={`h-full rounded-full ${over ? 'bg-amber-500' : 'bg-area-cleaning'}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className={`shrink-0 text-[12px] nums ${over ? 'font-medium text-amber-700' : 'text-neutral-500'}`}>
                        {formatDuration(day.total)}
                        <span className="text-neutral-400"> / {formatDuration(day.capacity)}</span>
                    </span>
                </div>
            </header>

            {groups.length === 0 ? (
                <p className="text-[13px] text-neutral-400">Nothing to do — a day off.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {groups.map((g, i) => (
                        <div key={`${g.room}-${i}`} className="flex flex-col gap-1">
                            <p className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">{g.room}</p>
                            <ul className="flex flex-col gap-1">
                                {g.items.map((item) => (
                                    <li key={`${item.taskKey}-${item.part ?? 0}`} className="flex items-start justify-between gap-2 text-[13px] leading-snug">
                                        <span className="min-w-0 text-neutral-800">
                                            {item.name}
                                            {item.parts && (
                                                <span className="ml-1.5 inline-flex rounded-full bg-area-cleaning-bg px-1.5 text-[11px] font-medium nums text-area-cleaning">
                                                    Part {item.part}/{item.parts}
                                                </span>
                                            )}
                                        </span>
                                        <span className="shrink-0 nums text-neutral-500">{formatDuration(item.minutes)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </article>
    )
}
