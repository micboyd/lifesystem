import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import { iconForHabit } from '../../lib/habitIcons'
import { streakFor } from '../../lib/habitSystem'
import { MoreTrigger } from './ui'
import type { HabitDef } from '../../types'

interface HabitRowProps {
    habit: HabitDef
    /** Dates this habit was completed on. */
    done: Set<string> | undefined
    /** The run of dates the dot strip covers, oldest first, ending today. */
    days: string[]
    today: string
    busy: boolean
    onToggle: () => void
    menu: MenuEntry[]
}

/**
 * One habit: what it is, how the last fortnight went, and today's tick. The dot
 * strip is the point — a slipping habit shows as gaps before it shows anywhere
 * else.
 */
export default function HabitRow({ habit, done, days, today, busy, onToggle, menu }: HabitRowProps) {
    const doneToday = done?.has(today) ?? false
    const streak = streakFor(done, today)

    return (
        <div className="flex items-center gap-3 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-500">
                <i className={iconForHabit(habit.name, habit.icon)} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{habit.name}</p>
                <div className="mt-1.5 flex items-center gap-3">
                    <div className="flex gap-1" aria-label="Last 14 days">
                        {days.map((d, i) => (
                            <span
                                key={d}
                                title={d}
                                className={`h-2 w-2 rounded-full ${
                                    done?.has(d) ? 'bg-neutral-900' : 'bg-neutral-200'
                                } ${i < days.length - 7 ? 'hidden sm:block' : ''}`}
                            />
                        ))}
                    </div>
                    {streak > 0 && (
                        <span className="text-xs font-semibold tabular-nums text-neutral-500">
                            {streak}d streak
                        </span>
                    )}
                </div>
            </div>

            <DropdownMenu align="right" trigger={<MoreTrigger label={`${habit.name} options`} />} items={menu} />

            <button
                type="button"
                onClick={onToggle}
                disabled={busy}
                aria-pressed={doneToday}
                aria-label={doneToday ? `Untick ${habit.name}` : `Tick ${habit.name} for today`}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors disabled:opacity-50 ${
                    doneToday
                        ? 'bg-neutral-900 text-white'
                        : 'text-transparent ring-2 ring-inset ring-neutral-200 hover:text-neutral-300 hover:ring-neutral-300'
                }`}
            >
                <i className="fa-solid fa-check text-sm" aria-hidden="true" />
            </button>
        </div>
    )
}
