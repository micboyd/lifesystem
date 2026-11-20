import type { Birthday, Reminder } from '../../types'

/** A day's reminders and birthdays as two small squares under its number: black, rose. */
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
    const dot = (on: boolean, color: string) =>
        `block h-[5px] w-[5px] ${on ? color : 'bg-transparent group-hover/day:bg-neutral-300'}`
    return (
        <div className="flex h-3 items-center justify-center gap-0.5">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onOpenReminders()
                }}
                aria-label={reminders.length ? `${reminders.length} reminder${reminders.length === 1 ? '' : 's'}` : 'Add reminder'}
                title={reminders.length ? reminders.map((r) => r.text).join('\n') : 'Add reminder'}
                className="grid h-3 w-3 place-items-center"
            >
                <span className={dot(reminders.length > 0, 'bg-neutral-900')} />
            </button>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onOpenBirthdays()
                }}
                aria-label={birthdays.length ? `${birthdays.length} birthday${birthdays.length === 1 ? '' : 's'}` : 'Birthdays'}
                title={birthdays.length ? birthdays.map((b) => b.name).join('\n') : 'Birthdays'}
                className="grid h-3 w-3 place-items-center"
            >
                <span className={dot(birthdays.length > 0, 'bg-[#b58c93]')} />
            </button>
        </div>
    )
}
