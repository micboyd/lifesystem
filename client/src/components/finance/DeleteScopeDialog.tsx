import Modal from '../Modal'
import Button from '../Button'
import type { DeleteMode } from '../../lib/finance'

interface Props {
    /** What's being deleted — used in the copy. */
    kind: 'group' | 'row'
    name: string
    /** Human-readable label for the viewed month, e.g. "June 2026". */
    monthLabel: string
    /**
     * Whether the 3-way scope choice applies. Recurring groups/rows offer
     * this-month / onward / all; one-time or savings rows just confirm.
     */
    scoped: boolean
    onClose: () => void
    onConfirm: (mode: DeleteMode) => void
}

interface Choice {
    mode: DeleteMode
    label: string
    detail: string
    danger?: boolean
}

export default function DeleteScopeDialog({
    kind,
    name,
    monthLabel,
    scoped,
    onClose,
    onConfirm,
}: Props) {
    const noun = kind === 'group' ? 'group' : 'row'

    if (!scoped) {
        return (
            <Modal
                open
                onClose={onClose}
                size="sm"
                title={`Delete ${noun}?`}
                footer={
                    <>
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            className="!bg-red-600 hover:!bg-red-500"
                            onClick={() => onConfirm('all')}
                        >
                            Delete
                        </Button>
                    </>
                }
            >
                <p>
                    Delete <span className="font-semibold text-neutral-900">{name}</span>? This
                    can&apos;t be undone.
                </p>
            </Modal>
        )
    }

    const choices: Choice[] = [
        {
            mode: 'month',
            label: 'This month only',
            detail: `Hide it from ${monthLabel}. It stays in every other month.`,
        },
        {
            mode: 'onward',
            label: 'From this month on',
            detail: `Hide it from ${monthLabel} and all future months. Past months keep it.`,
        },
        {
            mode: 'all',
            label: 'Delete everywhere',
            detail: `Remove it from every month, past and future. This can't be undone.`,
            danger: true,
        },
    ]

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            title={`Delete ${noun}`}
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Cancel
                </Button>
            }
        >
            <p className="mb-4">
                What should happen to <span className="font-semibold text-neutral-900">{name}</span>
                ?
            </p>
            <div className="flex flex-col gap-2">
                {choices.map((c) => (
                    <button
                        key={c.mode}
                        type="button"
                        onClick={() => onConfirm(c.mode)}
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
