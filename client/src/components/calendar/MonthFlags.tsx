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
    className?: string
}

/**
 * The flags hanging on one month, drawn as a row of chips. A flag spanning
 * several months appears on each of them with arrows marking the overflow, so
 * you can see at a glance that "Cutting" runs past the month you're looking at.
 */
export default function MonthFlags({ month, notes, onEdit, onAdd, className = '' }: Props) {
    const covering = notes.filter((n) => n.startMonth <= month && n.endMonth >= month)

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
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
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                            colors.bg,
                            colors.hover,
                            colors.text,
                        ].join(' ')}
                    >
                        {continuesBefore && (
                            <i className="fa-solid fa-caret-left text-[10px] opacity-60" aria-hidden="true" />
                        )}
                        <span>{note.label}</span>
                        {continuesAfter && (
                            <i className="fa-solid fa-caret-right text-[10px] opacity-60" aria-hidden="true" />
                        )}
                        {note.note && (
                            <i className="fa-solid fa-note-sticky text-[9px] opacity-50" aria-hidden="true" />
                        )}
                    </button>
                )
            })}
            <button
                type="button"
                onClick={() => onAdd(month)}
                aria-label={`Flag ${month}`}
                title="Flag this month"
                className="grid h-6 w-6 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
                <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
            </button>
        </div>
    )
}
