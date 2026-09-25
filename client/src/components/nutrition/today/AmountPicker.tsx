import { useState, type ReactNode } from 'react'
import type { Batch, FoodEntryUnit, Macros, Recipe, RecipePreset } from '../../../types'
import { canWeigh, cookedWeight, portionWeight } from '../../../lib/recipes'
import { fmt, kcal } from '../format'

/**
 * Portions or grams, sized for a thumb.
 *
 * Portions are the default because they need nothing — "1 of 7" works whether
 * or not the tray was weighed. Grams appear only when there's a cooked weight
 * to divide by, and say so when that weight is a guess.
 */

const PORTION_CHIPS = [0.5, 1, 1.5, 2]

export function AmountPicker({
    source,
    amount,
    unit,
    onChange,
}: {
    source: Recipe | Batch | null
    amount: number
    unit: FoodEntryUnit
    onChange: (amount: number, unit: FoodEntryUnit) => void
}) {
    const weighable = source ? canWeigh(source) : false
    const perPortion = source ? portionWeight(source) : null
    const presets: RecipePreset[] = source && 'presets' in source ? source.presets : []
    // Typed text is kept apart from the number so "1." or "" can sit in the box mid-edit.
    const [text, setText] = useState(String(amount))
    const [lastAmount, setLastAmount] = useState(amount)
    if (amount !== lastAmount) {
        setLastAmount(amount)
        if (Number(text) !== amount) setText(String(amount))
    }

    function set(next: number, nextUnit: FoodEntryUnit = unit) {
        setText(String(next))
        onChange(next, nextUnit)
    }

    function switchUnit(next: FoodEntryUnit) {
        if (next === unit) return
        // Carry the amount across rather than resetting: 1 portion → its grams.
        if (next === 'g') set(perPortion ? Math.round(perPortion.grams * amount) : 100, 'g')
        else set(perPortion ? Math.max(0.5, Math.round((amount / perPortion.grams) * 2) / 2) : 1, 'portion')
    }

    const step = unit === 'g' ? 10 : 0.5

    return (
        <div className="flex flex-col gap-3">
            {weighable && (
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1" role="group" aria-label="Measure by">
                    {(['portion', 'g'] as const).map((u) => (
                        <button
                            key={u}
                            type="button"
                            aria-pressed={unit === u}
                            onClick={() => switchUnit(u)}
                            className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                                unit === u ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                            }`}
                        >
                            {u === 'portion' ? 'Portions' : 'Grams'}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label="Less"
                    onClick={() => set(Math.max(step, +(amount - step).toFixed(2)))}
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-lg text-neutral-700 active:bg-neutral-200"
                >
                    <i className="fa-solid fa-minus" aria-hidden="true" />
                </button>
                <label className="relative min-w-0 flex-1">
                    <span className="sr-only">{unit === 'g' ? 'Grams' : 'Portions'}</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value)
                            const n = Number(e.target.value.replace(',', '.'))
                            if (Number.isFinite(n) && n > 0) onChange(n, unit)
                        }}
                        onFocus={(e) => e.target.select()}
                        className="h-14 w-full rounded-2xl border border-neutral-200 bg-white pr-20 text-center text-2xl font-bold tabular-nums text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-400">
                        {unit === 'g' ? 'g' : amount === 1 ? 'portion' : 'portions'}
                    </span>
                </label>
                <button
                    type="button"
                    aria-label="More"
                    onClick={() => set(+(amount + step).toFixed(2))}
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-lg text-neutral-700 active:bg-neutral-200"
                >
                    <i className="fa-solid fa-plus" aria-hidden="true" />
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                {unit === 'portion' &&
                    PORTION_CHIPS.map((n) => (
                        <Chip key={n} on={amount === n} onClick={() => set(n)}>
                            {n === 0.5 ? '½' : n === 1.5 ? '1½' : n}
                        </Chip>
                    ))}
                {unit === 'g' && perPortion && (
                    <Chip on={Math.round(perPortion.grams) === amount} onClick={() => set(Math.round(perPortion.grams))}>
                        1 portion · {Math.round(perPortion.grams)} g
                    </Chip>
                )}
                {presets.map((p) => (
                    <Chip
                        key={p.label}
                        on={unit === p.unit && amount === p.amount}
                        onClick={() => set(p.amount, p.unit)}
                        hint={p.hint}
                    >
                        {p.label}
                    </Chip>
                ))}
            </div>
        </div>
    )
}

function Chip({
    on,
    onClick,
    hint,
    children,
}: {
    on: boolean
    onClick: () => void
    hint?: string
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={`flex min-h-[44px] flex-col items-center justify-center rounded-2xl px-4 text-sm font-semibold transition-colors ${
                on ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200'
            }`}
        >
            {children}
            {hint && <span className={`text-[10px] font-medium ${on ? 'text-white/70' : 'text-neutral-400'}`}>{hint}</span>}
        </button>
    )
}

/**
 * What the chosen amount comes to, before it's saved. The weight line only
 * appears when there's a weight to state, and says when it's an estimate.
 */
export function MacroPreview({
    macros,
    source,
    amount,
    unit,
    estimated,
}: {
    macros: Macros | null
    source: Recipe | Batch | null
    amount: number
    unit: FoodEntryUnit
    estimated?: boolean
}) {
    const w = source ? cookedWeight(source) : null
    const per = source ? portionWeight(source) : null
    let weightLine: string | null = null
    if (unit === 'portion' && per) {
        weightLine = `${per.estimated ? '≈ ' : ''}${Math.round(per.grams * amount)} g${per.estimated ? ' — estimated weight' : ''}`
    } else if (unit === 'g' && w && source?.servings) {
        const portions = amount / (w.grams / source.servings)
        weightLine = `${fmt(Math.round(portions * 100) / 100)} of ${source.servings} portions`
    }

    return (
        <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/[0.04]">
            {macros ? (
                <>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-3xl font-bold tabular-nums tracking-tight text-neutral-950">
                            {kcal(macros.calories)}
                            <span className="ml-1 text-sm font-medium text-neutral-400">kcal</span>
                        </p>
                        {estimated && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                Estimate — cooked weight not measured
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-sm tabular-nums text-neutral-600">
                        <strong className="font-semibold text-neutral-900">{fmt(Math.round(macros.protein))} g</strong> protein ·{' '}
                        {fmt(Math.round(macros.carbs))} g carbs · {fmt(Math.round(macros.fat))} g fat
                    </p>
                    {weightLine && <p className="mt-1 text-xs tabular-nums text-neutral-400">{weightLine}</p>}
                </>
            ) : (
                <p className="text-sm text-neutral-500">Enter an amount.</p>
            )}
        </div>
    )
}
