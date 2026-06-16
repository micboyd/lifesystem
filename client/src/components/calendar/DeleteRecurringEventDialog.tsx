import Modal from '../Modal'
import Button from '../Button'
import { MONTHS, WEEKDAYS_LONG } from '../../lib/calendar'

export type DeleteScope = 'instance' | 'series'

interface Props {
    /** The event's title, shown in the copy. */
    title: string
    /** The occurrence being removed, YYYY-MM-DD. */
    occurrenceDate: string
    onClose: () => void
    onConfirm: (scope: DeleteScope) => void
}

function formatDate(date: string) {
    const [y, m, d] = date.split('-').map(Number)
    return `${WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

interface Choice {
    scope: DeleteScope
    label: string
    detail: string
    danger?: boolean
}

export default function DeleteRecurringEventDialog({
    title,
    occurrenceDate,
    onClose,
    onConfirm,
}: Props) {
    const choices: Choice[] = [
        {
            scope: 'instance',
            label: 'This event only',
            detail: `Remove just the occurrence on ${formatDate(occurrenceDate)}. The rest of the series stays.`,
        },
        {
            scope: 'series',
            label: 'All events in the series',
            detail: `Delete every occurrence of this repeating event. This can't be undone.`,
            danger: true,
        },
    ]

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            title="Remove repeating event"
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Cancel
                </Button>
            }
        >
            <p className="mb-4">
                What should happen to <span className="font-semibold text-neutral-900">{title}</span>
                ?
            </p>
            <div className="flex flex-col gap-2">
                {choices.map((c) => (
                    <button
                        key={c.scope}
                        type="button"
                        onClick={() => onConfirm(c.scope)}
                        className={[
                            'rounded-xl border px-4 py-3 text-left transition-colors',
                            c.danger
                                ? 'border-red-200 hover:border-red-300 hover:bg-red-50'
                                : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50',
                        ].join(' ')}
                    >
                        <p
                            className={`text-sm font-semibold ${c.danger ? 'text-red-600' : 'text-neutral-900'}`}
                        >
                            {c.label}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-400">{c.detail}</p>
                    </button>
                ))}
            </div>
        </Modal>
    )
}
