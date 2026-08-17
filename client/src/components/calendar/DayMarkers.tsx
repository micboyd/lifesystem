import type { Birthday, Reminder } from '../../types'

/**
 * The marker row that sits with a calendar day's number: a reminder bell on the
 * left, a birthday cake on the right. The pair shares one choreography:
 *
 *  - both empty     → nothing, until the day is hovered and both fade in grey,
 *  - one has content → it sits centred, and slides to its own side on hover as
 *                      the empty one expands beside it,
 *  - both have content → side by side, coloured.
 *
 * Empty markers collapse to zero width rather than unmounting, so the centring
 * and the slide are the same transition, and a day never changes height.
 * Touch has no hover, so below `sm` both markers simply stay visible.
 *
 * The parent day element must carry the `group/day` class.
 */

const MARKER =
    'inline-flex h-5 items-center overflow-hidden rounded-full leading-none transition-all duration-200'

/** A marker the day has content for: always laid out, always coloured. */
const FILLED = 'max-w-12 px-1 opacity-100'

/** An empty marker: collapsed away on pointer devices until the day is hovered. */
const EMPTY = [
    'max-w-12 px-1 text-neutral-300',
    'sm:max-w-0 sm:px-0 sm:opacity-0',
    'sm:group-hover/day:max-w-12 sm:group-hover/day:px-1 sm:group-hover/day:opacity-100',
].join(' ')

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
        <div className="flex min-w-11 items-center justify-center">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onOpenReminders()
                }}
                aria-label="Reminders"
                title={reminders.length ? reminders.map((r) => r.text).join('\n') : 'Add reminder'}
                className={`${MARKER} hover:bg-amber-100 ${
                    reminders.length ? `${FILLED} text-amber-500` : EMPTY
                }`}
            >
                <i className="fa-solid fa-bell text-[10px]" aria-hidden="true" />
                {reminders.length > 1 && (
                    <span className="ml-0.5 text-[9px] font-bold">{reminders.length}</span>
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
                    birthdays.length ? `${FILLED} text-pink-500` : EMPTY
                }`}
            >
                <i className="fa-solid fa-cake-candles text-[10px]" aria-hidden="true" />
                {birthdays.length > 1 && (
                    <span className="ml-0.5 text-[9px] font-bold">{birthdays.length}</span>
                )}
            </button>
        </div>
    )
}
