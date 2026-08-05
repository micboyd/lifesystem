import { useCallback, useEffect, useState } from 'react'
import Button from './Button'
import Alert from './Alert'
import ConfirmModal from './ConfirmModal'
import { useToast } from '../context/ToastContext'
import { getLastImport, undoLastImport, type ImportResource, type LastImport } from '../services/imports'

/** Compact "just now / 5 min ago / 2 hours ago / on 3 Aug" label for a timestamp. */
function whenLabel(iso: string): string {
    const then = new Date(iso).getTime()
    const mins = Math.round((Date.now() - then) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
    return `on ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

/**
 * Shows the most recent import batch for a library with a one-click revert. Sits
 * at the top of an import panel. Re-checks whenever `refreshKey` changes (e.g.
 * after a fresh import) and after a successful undo, so it always reflects the
 * current "latest import" — reverting repeatedly walks back through history.
 */
export default function ImportUndoBanner({
    resource,
    noun,
    refreshKey = 0,
    onReverted,
}: {
    resource: ImportResource
    /** Singular noun for messages, e.g. "session". */
    noun: string
    /** Bump to force a re-check (e.g. after an import completes). */
    refreshKey?: number
    /** Called after a successful revert so the library can reload. */
    onReverted: () => void
}) {
    const toast = useToast()
    const [last, setLast] = useState<LastImport | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [reverting, setReverting] = useState(false)

    const check = useCallback(() => {
        getLastImport(resource)
            .then(setLast)
            .catch(() => setLast(null))
    }, [resource])

    useEffect(() => {
        check()
    }, [check, refreshKey])

    if (!last) return null

    const plural = last.count === 1 ? noun : `${noun}s`

    async function revert() {
        setReverting(true)
        try {
            const removed = await undoLastImport(resource)
            toast.show(
                removed ? `Reverted ${removed.count} ${removed.count === 1 ? noun : `${noun}s`}.` : 'Import reverted.',
                'success'
            )
            setConfirmOpen(false)
            onReverted()
            check() // Surface the previous batch, if any.
        } catch {
            toast.show('Could not revert that import — please try again.', 'danger')
        } finally {
            setReverting(false)
        }
    }

    return (
        <>
            <Alert variant="warning" icon="fa-solid fa-clock-rotate-left">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                        Last import added{' '}
                        <span className="font-semibold">
                            {last.count} {plural}
                        </span>{' '}
                        {whenLabel(last.importedAt)}.
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon="fa-solid fa-rotate-left"
                        onClick={() => setConfirmOpen(true)}
                    >
                        Undo import
                    </Button>
                </div>
            </Alert>

            <ConfirmModal
                open={confirmOpen}
                danger
                title="Revert last import?"
                confirmLabel={reverting ? 'Reverting…' : `Remove ${last.count} ${plural}`}
                message={
                    <>
                        This permanently removes the{' '}
                        <span className="font-semibold">
                            {last.count} {plural}
                        </span>{' '}
                        added in the last import. Anything you added or edited by hand is left
                        untouched. This can’t be undone.
                    </>
                }
                onConfirm={revert}
                onClose={() => (reverting ? undefined : setConfirmOpen(false))}
            />
        </>
    )
}
