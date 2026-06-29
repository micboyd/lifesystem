import type { Reminder } from '../../types'

/**
 * Compact reminders affordance for a single calendar day. Renders as a small
 * amber bell pill so it barely adds height to a cell:
 *  - with reminders: a bell + the first reminder's text (and "+N" when several),
 *  - empty: a faint bell that only shows on hover (an add hint).
 * Clicking always opens the day's reminders drawer via `onOpen`.
 */
export default function ReminderChip({
    reminders,
    onOpen,
}: {
    reminders: Reminder[]
    onOpen: () => void
}) {
    if (reminders.length === 0) {
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onOpen()
                }}
                aria-label="Add reminder"
                className="group/rem grid h-full w-full place-items-center rounded-md text-amber-300 transition-colors hover:bg-amber-50"
            >
                <i className="fa-solid fa-bell text-[10px] opacity-0 transition-opacity group-hover/rem:opacity-100" />
            </button>
        )
    }

    const extra = reminders.length - 1
    return (
        <button
            type="button"
            title={reminders.map((r) => r.text).join('\n')}
            onClick={(e) => {
                e.stopPropagation()
                onOpen()
            }}
            className="flex w-full items-center gap-1 overflow-hidden rounded-md bg-amber-100 px-1.5 py-0.5 text-left text-amber-800 transition-colors hover:bg-amber-200"
        >
            <i className="fa-solid fa-bell shrink-0 text-[9px] opacity-70" aria-hidden="true" />
            <span className="truncate text-[10px] font-semibold leading-tight">
                {reminders[0].text}
            </span>
            {extra > 0 && (
                <span className="shrink-0 text-[9px] font-bold opacity-70">+{extra}</span>
            )}
        </button>
    )
}
