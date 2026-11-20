import { formatMonthRange } from '../../lib/calendar'
import { CALENDAR_COLOR_CLASSES } from '../../types'
import type { MonthNote } from '../../types'

interface Props {
    /** The YYYY-MM this strip belongs to. */
    month: string
    /** Every loaded flag; the strip picks out the ones covering `month` itself. */
    notes: MonthNote[]
    onEdit: (note: MonthNote) => void
    onAdd: (month: string) => void
    /** Hide the trailing "Add note" link when the caller shows its own. */
    hideAdd?: boolean
    className?: string
}

/**
 * The flags hanging on one month, drawn as a row of chips. A flag spanning
 * several months appears on each of them with arrows marking the overflow, so
 * you can see at a glance that "Cutting" runs past the month you're looking at.
 */
export default function MonthFlags({ month, notes, onEdit, onAdd, hideAdd = false, className = '' }: Props) {
    const covering = notes.filter((n) => n.startMonth <= month && n.endMonth >= month)

    return (
        <div className={`flex flex-wrap items-center gap-3 ${className}`}>
            {covering.map((note) => {
                const colors = CALENDAR_COLOR_CLASSES[note.color]
                const continuesBefore = note.startMonth < month
                const continuesAfter = note.endMonth > month
                const range = formatMonthRange(note.startMonth, note.endMonth)
                return (
                    <button
                        key={note._id}
                        type="button"
                        onClick={() => onEdit(note)}
                        title={note.note ? `${range} — ${note.note}` : range}
                        className={[
                            'inline-flex h-7 items-center gap-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.1em] transition',
                            colors.bg,
                            colors.hover,
                            colors.text,
                        ].join(' ')}
                    >
                        {continuesBefore && (
                            <i className="fa-solid fa-caret-left text-[11px] opacity-60" aria-hidden="true" />
                        )}
                        <span>{note.label}</span>
                        {continuesAfter && (
                            <i className="fa-solid fa-caret-right text-[11px] opacity-60" aria-hidden="true" />
                        )}
                        {note.note && (
                            <i className="fa-solid fa-note-sticky text-[9px] opacity-50" aria-hidden="true" />
                        )}
                    </button>
                )
            })}
            {!hideAdd && (
            <button
                type="button"
                onClick={() => onAdd(month)}
                aria-label={`Add a note to ${month}`}
                className={`inline-flex h-7 items-center whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600 underline underline-offset-4 hover:text-neutral-900 ${covering.length > 0 ? 'ml-4' : ''}`}
            >
                Add note
            </button>
            )}
        </div>
    )
}
