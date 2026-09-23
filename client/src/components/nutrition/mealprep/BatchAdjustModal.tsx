import { useEffect, useState } from 'react'
import Modal from '../../Modal'
import Button from '../../Button'
import Input from '../../Input'
import PillToggle from '../../PillToggle'
import { adjustBatch, buffetError, listMovements, requestKey, updateBatch, type AdjustInput } from '../../../services/mealPrep'
import { batchTitle, grams as fmtGrams } from '../../../lib/mealPrep'
import { todayKey } from '../../../lib/calendar'
import type { FoodBatch, StockMovement, StockMovementKind } from '../../../types'
import { MacroLine, NumberField, positive, nonNegative } from './ui'

/**
 * Stock corrections that aren't meals: someone else ate some, some went in the
 * bin, the tray was weighed again, it moved to the freezer, or it's gone. None
 * of them touch your macros. Each save carries a fresh request id, so a double
 * tap records one movement.
 */

type Action = 'others' | 'discard' | 'correction' | 'move' | 'finish'

const ACTIONS: { value: Action; label: string }[] = [
    { value: 'others', label: 'Someone else ate some' },
    { value: 'discard', label: 'Discarded' },
    { value: 'correction', label: 'Weighed again' },
    { value: 'move', label: 'Move' },
    { value: 'finish', label: 'Finished' },
]

const KIND_LABEL: Record<StockMovementKind, string> = {
    cook: 'Cooked',
    consume: 'You ate',
    restore: 'Meal edited or removed',
    others: 'Someone else ate',
    discard: 'Discarded',
    correction: 'Weighed again',
    move: 'Moved',
    finish: 'Marked finished',
}

export default function BatchAdjustModal({
    batch,
    onClose,
    onSaved,
}: {
    batch: FoodBatch | null
    onClose: () => void
    onSaved: (batch: FoodBatch) => void
}) {
    const [action, setAction] = useState<Action>('others')
    const [amount, setAmount] = useState('')
    const [all, setAll] = useState(false)
    const [note, setNote] = useState('')
    const [label, setLabel] = useState('')
    const [useBy, setUseBy] = useState('')
    const [thawed, setThawed] = useState('')
    const [history, setHistory] = useState<StockMovement[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // Reset on a different batch (not on every save of the same one).
    const [openedId, setOpenedId] = useState<string | null>(null)
    if ((batch?._id ?? null) !== openedId) {
        setOpenedId(batch?._id ?? null)
        if (batch) {
            setAction('others')
            setAmount('')
            setAll(false)
            setNote('')
            setLabel(batch.label ?? '')
            setUseBy(batch.useBy ?? '')
            setThawed(batch.thawedDate ?? '')
            setError('')
            setHistory([])
        }
    }

    const batchId = batch?._id
    useEffect(() => {
        if (!batchId) return
        let active = true
        listMovements(batchId)
            .then((m) => active && setHistory(m))
            .catch(() => {})
        return () => {
            active = false
        }
    }, [batchId, batch?.updatedAt])

    if (!batch) return null

    async function save() {
        if (!batch) return
        let input: AdjustInput
        if (action === 'others' || action === 'discard') {
            const g = positive(amount)
            if (!(action === 'discard' && all) && !g) return setError('Enter how many grams')
            input = action === 'others' ? { kind: 'others', grams: g! } : all ? { kind: 'discard', all: true } : { kind: 'discard', grams: g! }
        } else if (action === 'correction') {
            const g = nonNegative(amount)
            if (g === undefined) return setError('Enter the weight left — 0 g or more')
            input = { kind: 'correction', remainingGrams: g }
        } else if (action === 'move') {
            input = { kind: 'move', storage: batch.storage === 'fridge' ? 'freezer' : 'fridge' }
        } else {
            input = { kind: 'finish' }
        }
        setSaving(true)
        setError('')
        try {
            const saved = await adjustBatch(batch._id, { ...input, date: todayKey(), note: note.trim() || undefined, requestId: requestKey() })
            onSaved(saved)
            onClose()
        } catch (err) {
            setError(buffetError(err).message)
        } finally {
            setSaving(false)
        }
    }

    async function saveDetails() {
        if (!batch) return
        setSaving(true)
        try {
            onSaved(await updateBatch(batch._id, { label, useBy, thawedDate: thawed }))
        } catch (err) {
            setError(buffetError(err).message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open={!!batch}
            onClose={onClose}
            title="Adjust stock"
            size="md"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={saving}>
                        {action === 'move' ? `Move to ${batch.storage === 'fridge' ? 'freezer' : 'fridge'}` : action === 'finish' ? 'Mark finished' : 'Save'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <div>
                    <p className="font-semibold text-neutral-900">{batchTitle(batch)}</p>
                    <p className="text-xs text-neutral-500">
                        {fmtGrams(batch.remainingGrams)} left of {fmtGrams(batch.cookedGrams)} · {batch.storage} ·{' '}
                        <MacroLine macros={batch.per100} /> per 100 g
                    </p>
                </div>

                <PillToggle label="Adjustment" options={ACTIONS} value={action} onChange={(a) => { setAction(a); setError('') }} />

                {(action === 'others' || action === 'discard') && (
                    <div className="flex flex-col gap-2">
                        {!(action === 'discard' && all) && <NumberField label="How much" value={amount} onChange={setAmount} autoFocus />}
                        {action === 'discard' && (
                            <label className="flex items-center gap-2 text-xs text-neutral-600">
                                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
                                Throw away everything left and close the batch
                            </label>
                        )}
                        <p className="text-[11px] text-neutral-400">Removed from stock only — this doesn’t count towards your intake.</p>
                    </div>
                )}
                {action === 'correction' && (
                    <div className="flex flex-col gap-2">
                        <NumberField label="Weight left now (food only)" value={amount} onChange={setAmount} autoFocus />
                        <p className="text-[11px] text-neutral-400">
                            Sets the remaining weight to the reading. Nutrition per gram doesn’t change. Meals logged before
                            now keep their macros if edited later, but no longer move this stock — the reading already includes them.
                        </p>
                    </div>
                )}
                {action === 'move' && (
                    <p className="text-xs text-neutral-500">
                        {batch.storage === 'freezer'
                            ? 'Moving it to the fridge records today as the thawed date unless one is set.'
                            : 'Frozen stock still counts as available, but not as ready to eat.'}
                    </p>
                )}
                {action === 'finish' && <p className="text-xs text-neutral-500">Sets the remaining weight to zero and closes the batch.</p>}

                <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

                <details className="rounded-xl border border-neutral-100 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-neutral-500">Label and dates</summary>
                    <div className="mt-3 flex flex-col gap-3">
                        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Use by (your date)" type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
                            <Input label="Thawed on" type="date" value={thawed} onChange={(e) => setThawed(e.target.value)} />
                        </div>
                        <div>
                            <Button size="sm" variant="secondary" onClick={saveDetails} disabled={saving}>
                                Save label and dates
                            </Button>
                        </div>
                        <p className="text-[11px] text-neutral-400">
                            Dates are shown as you enter them. The app doesn’t judge whether food is still safe to eat.
                        </p>
                    </div>
                </details>

                {history.length > 0 && (
                    <details className="rounded-xl border border-neutral-100 px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-neutral-500">Stock history ({history.length})</summary>
                        <ul className="mt-2 flex flex-col divide-y divide-neutral-100 text-xs">
                            {[...history].reverse().map((m) => (
                                <li key={m._id} className="flex items-baseline justify-between gap-3 py-1.5">
                                    <span className="text-neutral-600">
                                        {m.date} · {KIND_LABEL[m.kind]}
                                        {m.sealed && <span className="text-neutral-400"> (balance kept)</span>}
                                        {m.note && <span className="text-neutral-400"> — {m.note}</span>}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-neutral-500">
                                        {m.grams > 0 ? '+' : m.grams < 0 ? '−' : '±'}
                                        {Math.abs(Math.round(m.grams))} g → {Math.round(m.balanceAfter)} g
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}

                {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            </div>
        </Modal>
    )
}
