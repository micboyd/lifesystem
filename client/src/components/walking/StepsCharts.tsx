import { addDays } from '../../lib/calendar'
import type { DaySteps } from '../../lib/steps'

/** Walking's greens: pale under target, mid over it, darkest for today. */
const GREEN = { under: '#a9c1b3', over: '#5e8a72', today: '#2f5a44', empty: '#e3ebe6' }

const weekday = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
const fmt = (n: number) => n.toLocaleString('en-GB')

/** The last seven days of steps as bars, with the daily target as a dashed line. */
export function StepsByDay({ days, today, goal }: { days: DaySteps[]; today: string; goal?: number }) {
    const byDate = new Map(days.map((d) => [d.date, d.steps]))
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((date) => ({ date, steps: byDate.get(date) ?? 0 }))
    const max = Math.max(goal ?? 0, ...week.map((d) => d.steps), 1)
    const H = 180
    const label = week.map((d) => `${d.date === today ? 'today' : weekday(d.date)} ${fmt(d.steps)}`).join(', ')
    return (
        <div>
            <h2 className="text-[26px] font-normal leading-[1.15] tracking-[-0.02em]">Steps by day</h2>
            <div
                role="img"
                aria-label={`Steps: ${label}.${goal ? ` Target ${fmt(goal)}.` : ''}`}
                className="relative mt-5 grid grid-cols-7 items-end gap-2.5 border-b border-neutral-900"
                style={{ height: H }}
            >
                {week.map((d) => (
                    <div
                        key={d.date}
                        style={{
                            height: `${(d.steps / max) * 100}%`,
                            background: d.date === today ? GREEN.today : goal && d.steps >= goal ? GREEN.over : GREEN.under,
                        }}
                    />
                ))}
                {goal ? (
                    <span aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-neutral-600" style={{ bottom: `${(goal / max) * 100}%` }} />
                ) : null}
            </div>
            <div aria-hidden="true" className="mt-2 grid grid-cols-7 gap-2.5 text-center text-[12px] text-neutral-600">
                {week.map((d) => (
                    <span key={d.date} className={d.date === today ? 'font-medium text-neutral-900' : ''}>
                        {weekday(d.date)}
                    </span>
                ))}
            </div>
        </div>
    )
}

/** Twelve weeks of daily steps as a grid of squares: a column a week, darker for more. */
export function LastTwelveWeeks({ days, today, goal = 10000 }: { days: DaySteps[]; today: string; goal?: number }) {
    const byDate = new Map(days.map((d) => [d.date, d.steps]))
    // Columns are weeks (Mon–Sun), oldest first, ending with this week.
    const dow = (new Date(`${today}T00:00:00`).getDay() + 6) % 7
    const start = addDays(today, -dow - 7 * 11)
    const cells = Array.from({ length: 84 }, (_, i) => {
        const week = Math.floor(i / 7)
        const day = i % 7
        const date = addDays(start, week * 7 + day)
        return { date, week, day, steps: date > today ? null : (byDate.get(date) ?? 0) }
    })
    const shade = (n: number | null) =>
        n === null ? 'transparent' : n >= goal * 1.2 ? GREEN.today : n >= goal ? GREEN.over : n >= goal * 0.6 ? GREEN.under : GREEN.empty
    const counted = cells.filter((c) => c.steps !== null)
    const hit = counted.filter((c) => (c.steps ?? 0) >= goal).length
    return (
        <div>
            <h2 className="text-[26px] font-normal leading-[1.15] tracking-[-0.02em]">Last 12 weeks</h2>
            <div
                role="img"
                aria-label={`Daily steps for the last 12 weeks, darker for more. ${hit} of ${counted.length} days over ${fmt(goal)}.`}
                className="mt-5 grid max-w-[340px] grid-flow-col grid-cols-12 grid-rows-7 gap-1"
            >
                {cells.map((c) => (
                    <span
                        key={c.date}
                        title={c.steps === null ? undefined : `${c.date}: ${fmt(c.steps)} steps`}
                        className="aspect-square"
                        style={{ background: shade(c.steps) }}
                    />
                ))}
            </div>
            <p className="mt-3 text-[13px] text-neutral-600">
                {hit} of {counted.length} days over {fmt(goal)}
            </p>
        </div>
    )
}
