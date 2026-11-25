import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import { FIELD_BASE, FIELD_IDLE, FIELD_LABEL, FIELD_HINT } from '../fieldStyles'
import { clearAllFinances } from '../../services/finances'

interface Props {
    open: boolean
    onClose: () => void
    /** Runs after the wipe succeeds and the backup has been saved. */
    onCleared: () => void
}

/** Save the removed data as a JSON file so a wipe can be undone by hand. */
function downloadBackup(backup: unknown) {
    const day = new Date().toISOString().slice(0, 10)
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finances-backup-${day}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

/**
 * Wipes the whole finance plan back to a blank sheet. Typing CLEAR is the
 * guard; a backup file of everything removed downloads as it happens.
 */
export default function ClearAllDialog({ open, onClose, onCleared }: Props) {
    const [typed, setTyped] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setTyped('')
            setError(null)
        }
    }, [open])

    const ready = typed.trim().toUpperCase() === 'CLEAR'

    async function handleClear() {
        if (!ready || busy) return
        setBusy(true)
        setError(null)
        try {
            const { backup } = await clearAllFinances()
            downloadBackup(backup)
            onCleared()
        } catch {
            setError('Couldn’t clear your finances. Nothing was removed — try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            open={open}
            onClose={busy ? () => {} : onClose}
            title="Clear all finances?"
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        className="bg-red-600 hover:bg-red-700 active:bg-red-800"
                        onClick={handleClear}
                        disabled={!ready || busy}
                    >
                        {busy ? 'Clearing…' : 'Clear everything'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4 text-[15px] text-neutral-800">
                <p>This takes you back to a blank sheet. It removes:</p>
                <ul className="list-disc space-y-1 pl-5 text-neutral-700">
                    <li>Every group, pot and row, in every month</li>
                    <li>Amounts, paid ticks and breakdowns</li>
                    <li>Budget spends, top-ups and excluded days</li>
                    <li>Your savings plans</li>
                </ul>
                <p className="text-neutral-600">
                    Your bank connection and Statement stay. A backup file of everything removed downloads as it happens.
                </p>
                <label className="block space-y-1.5">
                    <span className={FIELD_LABEL}>Type CLEAR to confirm</span>
                    <input
                        className={`${FIELD_BASE} ${FIELD_IDLE} h-11 px-3`}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleClear()}
                        autoComplete="off"
                        autoCapitalize="characters"
                        disabled={busy}
                    />
                </label>
                {error ? <p className="text-xs text-red-600">{error}</p> : <p className={FIELD_HINT}>This can’t be undone here.</p>}
            </div>
        </Modal>
    )
}
