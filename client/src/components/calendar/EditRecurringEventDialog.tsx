import Modal from '../Modal'
import Button from '../Button'
import { MONTHS, WEEKDAYS_LONG } from '../../lib/calendar'

export type EditScope = 'instance' | 'series'

interface Props {
    /** The event's title, shown in the copy. */
    title: string
    /** The occurrence being edited, YYYY-MM-DD. */
    occurrenceDate: string
    onClose: () => void
    onConfirm: (scope: EditScope) => void
}

function formatDate(date: string) {
    const [y, m, d] = date.split('-').map(Number)
    return `${WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

interface Choice {
    scope: EditScope
    label: string
    detail: string
}

export default function EditRecurringEventDialog({
    title,
    occurrenceDate,
    onClose,
    onConfirm,
}: Props) {
    const choices: Choice[] = [
        {
            scope: 'instance',
            label: 'This event only',
            detail: `Apply your changes to just the occurrence on ${formatDate(occurrenceDate)}. The rest of the series stays as it is.`,
        },
        {
            scope: 'series',
            label: 'All events in the series',
            detail: 'Apply your changes to every occurrence of this repeating event.',
        },
    ]

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            title="Edit repeating event"
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Cancel
                </Button>
            }
        >
            <p className="mb-4">
                Which occurrences of{' '}
                <span className="font-semibold text-neutral-900">{title}</span> should change?
            </p>
            <div className="flex flex-col gap-2">
                {choices.map((c) => (
                    <button
                        key={c.scope}
                        type="button"
                        onClick={() => onConfirm(c.scope)}
                        className="rounded-xl border border-neutral-200 px-4 py-3 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                    >
                        <p className="text-sm font-semibold text-neutral-900">{c.label}</p>
                        <p className="mt-0.5 text-xs text-neutral-400">{c.detail}</p>
                    </button>
                ))}
            </div>
        </Modal>
    )
}
