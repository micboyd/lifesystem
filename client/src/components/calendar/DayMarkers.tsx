import type { Birthday, Reminder } from '../../types'

/**
 * The marker row that sits under a calendar day's number: a reminder bell and a
 * birthday cake. Both markers behave the same way — coloured when the day has
 * something, and a faint hover-only hint when it doesn't (always visible on
 * touch, where there is no hover). Both are always laid out, so a day with a
 * birthday is no taller or wider than one without.
 *
 * The parent day element must carry the `group/day` class for the hover hint.
 */

const MARKER =
    'inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1 leading-none transition-colors'
const IDLE = 'text-neutral-300 opacity-100 sm:opacity-0 sm:group-hover/day:opacity-100'

export default function DayMarkers({
    reminders,
    birthdays,
    onOpenReminders,
    onOpenBirthdays,
}: {
    reminders: Reminder[]
    birthdays: Birthday[]
    onOpenReminders: () => void
    onOpenBirthdays: () => void
}) {
    return (
        <div className="flex items-center gap-0.5">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onOpenReminders()
                }}
                aria-label="Reminders"
                title={reminders.length ? reminders.map((r) => r.text).join('\n') : 'Add reminder'}
                className={`${MARKER} hover:bg-amber-100 ${
                    reminders.length ? 'text-amber-500' : IDLE
                }`}
            >
                <i className="fa-solid fa-bell text-[10px]" aria-hidden="true" />
                {reminders.length > 1 && (
                    <span className="text-[9px] font-bold">{reminders.length}</span>
                )}
            </button>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onOpenBirthdays()
                }}
                aria-label="Birthdays"
                title={birthdays.length ? birthdays.map((b) => b.name).join('\n') : 'Birthdays'}
                className={`${MARKER} hover:bg-pink-100 ${
                    birthdays.length ? 'text-pink-500' : IDLE
                }`}
            >
                <i className="fa-solid fa-cake-candles text-[10px]" aria-hidden="true" />
                {birthdays.length > 1 && (
                    <span className="text-[9px] font-bold">{birthdays.length}</span>
                )}
            </button>
        </div>
    )
}
