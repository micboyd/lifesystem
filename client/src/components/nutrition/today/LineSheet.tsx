import { useState } from 'react'
import BottomSheet from '../../BottomSheet'
import Button from '../../Button'
import Input from '../../Input'
import { AmountPicker, MacroPreview } from './AmountPicker'
import { deleteFoodEntry, updateFoodEntry } from '../../../services/food'
import { amountMacros, round, scale } from '../../../lib/recipes'
import type { Batch, EntryStatus, FoodEntry, FoodEntryUnit, Macros, Recipe } from '../../../types'

const STATUSES: { value: EntryStatus; label: string }[] = [
    { value: 'planned', label: 'Planned' },
    { value: 'eaten', label: 'Eaten' },
    { value: 'skipped', label: 'Skipped' },
]

/**
 * One line of the day, opened: change how much, tick it off, or remove it.
 *
 * The preview mirrors what the server will do. Same unit → the line's own
 * figures scaled, so a batch edited since can't creep into a past meal. A
 * different unit has to go back to the batch. "Recalculate" is the explicit
 * way to pull a batch's current figures into a line that's already eaten.
 */
export default function LineSheet({
    entry,
    source,
    onClose,
    onSaved,
    onDeleted,
}: {
    entry: FoodEntry | null
    /** The batch or recipe behind it, if it still exists. */
    source: Recipe | Batch | null
    onClose: () => void
    onSaved: (e: FoodEntry) => void
    onDeleted: (id: string) => void
}) {
    const [status, setStatus] = useState<EntryStatus>('planned')
    const [amount, setAmount] = useState(1)
    const [unit, setUnit] = useState<FoodEntryUnit>('portion')
    const [name, setName] = useState('')
    const [quick, setQuick] = useState({ calories: '', protein: '', carbs: '', fat: '' })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const [loadedId, setLoadedId] = useState<string | null>(null)
    if (entry && entry._id !== loadedId) {
        setLoadedId(entry._id)
        setStatus(entry.status)
        setAmount(entry.amount)
        setUnit(entry.unit)
        setName(entry.name)
        setQuick({
            calories: String(entry.macros.calories),
            protein: String(entry.macros.protein),
            carbs: String(entry.macros.carbs),
            fat: String(entry.macros.fat),
        })
        setError('')
    }

    const isQuick = entry ? !entry.batch && !entry.recipe : false

    let preview: { macros: Macros; estimated: boolean } | null = null
    if (entry && !isQuick) {
        if (unit === entry.unit) {
            preview = { macros: round(scale(entry.macros, amount / entry.amount)), estimated: !!entry.estimated }
        } else if (source) {
            preview = amountMacros(source, amount, unit)
        }
    }

    async function run(fn: () => Promise<void>) {
        setBusy(true)
        setError('')
        try {
            await fn()
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } }
            setError(err.response?.data?.message ?? 'Something went wrong — try again.')
        } finally {
            setBusy(false)
        }
    }

    function save() {
        if (!entry) return
        const n = (v: string) => Math.max(0, Number(v) || 0)
        return run(async () => {
            const saved = await updateFoodEntry(
                entry._id,
                isQuick
                    ? {
                          status,
                          name: name.trim() || entry.name,
                          macros: { calories: n(quick.calories), protein: n(quick.protein), carbs: n(quick.carbs), fat: n(quick.fat) },
                      }
                    : { status, amount, unit }
            )
            onSaved(saved)
            onClose()
        })
    }

    return (
        <BottomSheet
            open={!!entry}
            onClose={onClose}
            title={entry?.name}
            footer={
                <div className="flex flex-col gap-2">
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-2">
                        <Button className="min-h-[52px] flex-1 text-base" onClick={save} disabled={busy}>
                            Save
                        </Button>
                        <Button
                            variant="ghost"
                            className="min-h-[52px]"
                            icon="fa-solid fa-trash-can"
                            disabled={busy}
                            onClick={() =>
                                entry &&
                                run(async () => {
                                    await deleteFoodEntry(entry._id)
                                    onDeleted(entry._id)
                                    onClose()
                                })
                            }
                        >
                            Remove
                        </Button>
                    </div>
                </div>
            }
        >
            {entry && (
                <div className="flex flex-col gap-4 pt-1">
                    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1" role="group" aria-label="Status">
                        {STATUSES.map((s) => (
                            <button
                                key={s.value}
                                type="button"
                                aria-pressed={status === s.value}
                                onClick={() => setStatus(s.value)}
                                className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                                    status === s.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    {isQuick ? (
                        <>
                            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                            <div className="grid grid-cols-2 gap-3">
                                {(['calories', 'protein', 'carbs', 'fat'] as const).map((k) => (
                                    <Input
                                        key={k}
                                        label={k === 'calories' ? 'kcal' : `${k[0].toUpperCase()}${k.slice(1)} (g)`}
                                        type="text"
                                        inputMode="decimal"
                                        value={quick[k]}
                                        onChange={(e) => setQuick((v) => ({ ...v, [k]: e.target.value }))}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <AmountPicker
                                source={source}
                                amount={amount}
                                unit={unit}
                                onChange={(a, u) => {
                                    setAmount(a)
                                    setUnit(u)
                                }}
                            />
                            <MacroPreview
                                macros={preview?.macros ?? null}
                                estimated={preview?.estimated}
                                source={source}
                                amount={amount}
                                unit={unit}
                            />
                            {!source && (
                                <p className="text-xs text-neutral-500">
                                    Its batch or recipe has been removed, so only the amount in the same unit can change.
                                </p>
                            )}
                            {source && entry.status === 'eaten' && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        run(async () => {
                                            const saved = await updateFoodEntry(entry._id, { amount, unit, status, restamp: true })
                                            onSaved(saved)
                                            onClose()
                                        })
                                    }
                                    className="self-start text-xs font-semibold text-neutral-500 underline"
                                >
                                    Recalculate from the current {'cookedOn' in source ? 'batch' : 'recipe'} figures
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </BottomSheet>
    )
}
