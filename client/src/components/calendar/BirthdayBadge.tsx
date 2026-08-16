import type { Birthday } from '../../types'

/**
 * Cake affordance for a calendar day that has birthdays on it. Birthdays are
 * not events, so they don't take a slot in the grid — this pill sits in the
 * day's header alongside the reminder bell and opens the birthdays drawer.
 * Renders nothing when the day has no birthdays.
 */
export default function BirthdayBadge({
    birthdays,
    onOpen,
}: {
    birthdays: Birthday[]
    onOpen: () => void
}) {
    if (birthdays.length === 0) return null

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                onOpen()
            }}
            aria-label="Birthdays"
            title={birthdays.map((b) => b.name).join('\n')}
            className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-pink-500 transition-colors hover:bg-pink-100"
        >
            <i className="fa-solid fa-cake-candles text-[10px]" aria-hidden="true" />
            {birthdays.length > 1 && (
                <span className="text-[9px] font-bold leading-none">{birthdays.length}</span>
            )}
        </button>
    )
}
