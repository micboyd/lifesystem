import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH, SectionLoading } from './DashSection'
import { useCaloriesOut, type DayBurn } from './useCaloriesOut'
import { addDays, todayKey } from '../../lib/calendar'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmt = (n: number) => n.toLocaleString('en-GB')
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

interface WeekDay {
    date: string
    kcal: number | null
}

/**
 * Whole-day calories burned from Garmin, read-only: today so far, the last
 * week as bars against its average, and the week's figures. Today is kept out
 * of the average — half a day would drag it down every morning.
 */
export default function CaloriesOutWidget() {
    const today = todayKey()
    const { days, todayKcal, status, settled } = useCaloriesOut(today)

    const s = useMemo(() => {
        if (!days) return null
        const byDate = new Map(days.map((d: DayBurn) => [d.date, d.kcal]))
        const week: WeekDay[] = []
        for (let back = 7; back >= 1; back--) {
            const date = addDays(today, -back)
            week.push({ date, kcal: byDate.get(date) ?? null })
        }
        const known = week.flatMap((d) => (d.kcal === null ? [] : [d.kcal]))
        return {
            week,
            counted: known.length,
            average: known.length ? Math.round(known.reduce((a, n) => a + n, 0) / known.length) : null,
            highest: known.length ? Math.max(...known) : null,
            lowest: known.length ? Math.min(...known) : null,
        }
    }, [days, today])

    const hasData = s !== null && (todayKcal !== null || s.counted > 0)
    const disconnected = status === 'not_connected' || status === 'pending_mfa'

    return (
        <DashSection title="Calories burned" icon="fa-solid fa-fire" tone="orange" meta="Whole day, from Garmin">
            {!s || (!hasData && !settled) ? (
                <SectionLoading />
            ) : !hasData ? (
                <p className={DASH.empty}>
                    {disconnected || status === 'expired' ? (
                        <Link to="/profile#garmin" className={DASH.emptyLink}>
                            {status === 'expired' ? 'Reconnect Garmin' : 'Connect Garmin'}
                        </Link>
                    ) : (
                        'No calories from Garmin yet.'
                    )}
                </p>
            ) : (
                <>
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <p className={DASH.subhead}>Today so far</p>
                            <p className={`mt-1 ${DASH.figure}`}>
                                {todayKcal === null ? '—' : fmt(todayKcal)}
                                {todayKcal !== null && <span className="ml-1 text-base font-normal text-neutral-500">kcal</span>}
                            </p>
                        </div>
                        <p className={`${DASH.note} nums`}>
                            {todayKcal === null
                                ? 'Not synced yet'
                                : s.average !== null
                                  ? `${Math.round((todayKcal / s.average) * 100)}% of average`
                                  : null}
                        </p>
                    </div>

                    <WeekBars week={s.week} today={todayKcal} average={s.average} />

                    <dl className={`${DASH.block} grid grid-cols-3 gap-3 rounded-2xl bg-neutral-50 p-4`}>
                        <Stat
                            label="Average"
                            value={s.average === null ? '—' : fmt(s.average)}
                            note={s.counted > 0 && s.counted < 7 ? `${s.counted} day${s.counted === 1 ? '' : 's'}` : undefined}
                        />
                        <Stat label="Highest" value={s.highest === null ? '—' : fmt(s.highest)} />
                        <Stat label="Lowest" value={s.lowest === null ? '—' : fmt(s.lowest)} />
                    </dl>

                    {status === 'expired' && (
                        <p className={`mt-3 ${DASH.note}`}>
                            Garmin needs reconnecting, so these may be out of date.{' '}
                            <Link to="/profile#garmin" className={DASH.emptyLink}>
                                Reconnect
                            </Link>
                        </p>
                    )}
                </>
            )}
        </DashSection>
    )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="min-w-0">
            <dt className="truncate text-xs text-neutral-500">
                {label}
                {note && <span className="ml-1">· {note}</span>}
            </dt>
            <dd className="mt-0.5 truncate text-[15px] font-medium tabular-nums text-neutral-900">{value}</dd>
        </div>
    )
}

/** The last seven days and today as bars, with a dashed line at the week's average. */
function WeekBars({ week, today, average }: { week: WeekDay[]; today: number | null; average: number | null }) {
    const days = [
        ...week.map((d) => ({ key: d.date, name: weekday(d.date), kcal: d.kcal, isToday: false })),
        { key: 'today', name: 'Today', kcal: today, isToday: true },
    ]
    const [shown, setShown] = useState<number | null>(null)
    const top = Math.max(average ?? 0, ...days.map((d) => d.kcal ?? 0), 1)
    const height = 96
    const px = (n: number) => Math.max(4, Math.round((n / top) * height))
    return (
        <div className={DASH.block}>
            <div className="relative grid grid-cols-8 items-end gap-1.5" style={{ height }}>
                {average !== null && (
                    <span
                        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-300"
                        style={{ bottom: px(average) }}
                        aria-hidden="true"
                    />
                )}
                {days.map((d, i) => {
                    const open = shown === i
                    // Keep the end tooltips inside the card.
                    const align =
                        i === 0 ? 'left-0' : i === days.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    return (
                        <button
                            type="button"
                            key={d.key}
                            className="relative flex h-full w-full items-end focus:outline-none"
                            onMouseEnter={() => setShown(i)}
                            onMouseLeave={() => setShown(null)}
                            onFocus={() => setShown(i)}
                            onBlur={() => setShown(null)}
                            onClick={() => setShown(open ? null : i)}
                            aria-label={d.kcal === null ? `${d.name}: no data` : `${d.name}: ${fmt(d.kcal)} kcal`}
                        >
                            <span
                                className={`relative w-full rounded-md transition-opacity ${
                                    d.kcal === null ? 'bg-neutral-100' : 'bg-orange-500'
                                } ${shown !== null && !open ? 'opacity-50' : ''}`}
                                style={{ height: d.kcal === null ? 4 : px(d.kcal) }}
                            >
                                {open && (
                                    <span
                                        className={`pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-lg bg-neutral-900 px-2 py-1 text-[12px] font-medium tabular-nums text-white shadow-sm ${align}`}
                                    >
                                        {d.kcal === null ? 'No data' : `${fmt(d.kcal)} kcal`}
                                    </span>
                                )}
                            </span>
                        </button>
                    )
                })}
            </div>
            <div className="mt-2 grid grid-cols-8 gap-1.5" aria-hidden="true">
                {days.map((d) => (
                    <span
                        key={d.key}
                        className={`truncate text-center text-[11px] ${d.isToday ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}
                    >
                        {d.name}
                    </span>
                ))}
            </div>
            <p className="sr-only">
                {days.map((d) => `${d.name}: ${d.kcal === null ? 'no data' : `${fmt(d.kcal)} kcal`}`).join(', ')}
            </p>
        </div>
    )
}
