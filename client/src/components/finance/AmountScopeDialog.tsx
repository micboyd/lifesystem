import Modal from '../Modal'
import Button from '../Button'
import type { AmountScope } from '../../lib/finance'

interface Props {
    name: string
    /** Human-readable label for the viewed month, e.g. "June 2026". */
    monthLabel: string
    onClose: () => void
    onConfirm: (scope: AmountScope) => void
}

interface Choice {
    scope: AmountScope
    label: string
    detail: string
}

/** Asks how an edited recurring amount should apply, mirroring the delete
 *  scope dialog: from the viewed month onwards, or across every month. */
export default function AmountScopeDialog({ name, monthLabel, onClose, onConfirm }: Props) {
    const choices: Choice[] = [
        {
            scope: 'onward',
            label: `From ${monthLabel} onwards`,
            detail: `Use the new amount from ${monthLabel} on. Past months keep the old amount.`,
        },
        {
            scope: 'all',
            label: 'All months',
            detail: 'Use the new amount everywhere, past and future.',
        },
    ]

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            title="Change recurring amount"
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Cancel
                </Button>
            }
        >
            <p className="mb-4">
                Where should the new amount for{' '}
                <span className="font-semibold text-neutral-900">{name}</span> apply?
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
