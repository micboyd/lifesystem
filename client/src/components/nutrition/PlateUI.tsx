import { useState } from 'react'
import Button from '../Button'
import { MacroBar, MacroLegend } from './mealUi'
import { fmt, kcal } from './format'
import { gramsLeft, lineMacros, plateTotal, ZERO } from '../../lib/plates'
import { shortDate } from './BoxLibrary'
import type { BoxCook, Macros, MealPlanEntry, PlateFood, PlateLine, PlateLineInput } from '../../types'

/**
 * Plates: a meal weighed out from boxes and plain foods. The builder puts one
 * together in the day drawer; the lines editor changes a plate's grams at the
 * table. Both preview the numbers the server will store.
 */

/** "Chicken box + Rice" for a plate, the meal's name otherwise. Grams go on the meta line. */
export function plateTitle(entry: MealPlanEntry): string {
    if (!entry.plate?.length) return entry.name
    return entry.plate.map((l) => l.name).join(' + ')
}

/** A plate's total weight, "510 g" — or null for a saved meal. */
export function plateGrams(entry: MealPlanEntry): string | null {
    if (!entry.plate?.length) return null
    return `${fmt(entry.plate.reduce((sum, l) => sum + l.grams, 0))} g`
}

const num = (v: string) => Math.max(0, Number(v) || 0)

const gramsInputCls =
    'h-11 w-20 rounded-xl border border-neutral-200 bg-white px-2 text-right text-base font-semibold tabular-nums text-neutral-900 outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-100'

function PlateTotal({ macros }: { macros: Macros }) {
    return (
        <div className="flex flex-col gap-2 rounded-2xl bg-neutral-50 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Plate</span>
                <span className="text-lg font-semibold tabular-nums text-neutral-900">{kcal(macros.calories)} kcal</span>
            </div>
            <MacroBar macros={macros} thick />
            <MacroLegend macros={macros} compact />
        </div>
    )
}

/**
 * Something that can go on a new plate: a cooked batch still in the pantry, or
 * a plain food. A box that's never been cooked — or whose batches are all
 * finished — isn't offered: there's nothing in the fridge to weigh out.
 */
type Source = {
    key: string
    food: PlateFood
    cook: BoxCook | null
    label: string
    per100: Macros
    left: number | null
}

function sourcesFrom(foods: PlateFood[]): { batches: Source[]; plain: Source[] } {
    const byOrder = [...foods].sort((a, b) => a.order - b.order)
    const batches = byOrder
        .filter((f) => f.kind === 'box')
        .flatMap((f) =>
            f.open.map((c) => ({
                key: c._id,
                food: f,
                cook: c,
                // Two open batches of one box are told apart by when they were cooked.
                label: f.open.length > 1 ? `${f.name} · ${shortDate(c.date)}` : f.name,
                per100: c.per100,
                left: gramsLeft(c.cookedGrams, c.eatenGrams),
            }))
        )
    const plain = byOrder
        .filter((f) => f.kind === 'plain')
        .map((f) => ({ key: f._id, food: f, cook: null, label: f.name, per100: f.per100 ?? ZERO, left: null }))
    return { batches, plain }
}

type Draft = { key: string; grams: string }

export function PlateBuilder({
    foods,
    busy,
    actionLabel,
    onAdd,
}: {
    foods: PlateFood[]
    busy: boolean
    actionLabel: string
    onAdd: (plate: PlateLineInput[]) => Promise<void>
}) {
    const [lines, setLines] = useState<Draft[]>([])
    const { batches, plain } = sourcesFrom(foods)
    const byKey = new Map([...batches, ...plain].map((src) => [src.key, src]))

    const resolved = lines.flatMap((l) => {
        const src = byKey.get(l.key)
        return src ? [{ ...l, src, g: num(l.grams) }] : []
    })
    const total = plateTotal(resolved.map((l) => ({ grams: l.g, per100: l.src.per100 })))
    const ready = resolved.some((l) => l.g > 0)

    function patch(i: number, grams: string) {
        setLines((prev) => prev.map((l, j) => (j === i ? { ...l, grams } : l)))
    }

    async function submit() {
        if (!ready) return
        await onAdd(
            resolved
                .filter((l) => l.g > 0)
                .map((l) => ({ food: l.src.food._id, grams: l.g, ...(l.src.cook ? { batch: l.src.cook._id } : {}) }))
        )
        setLines([])
    }

    if (batches.length === 0 && plain.length === 0) {
        return (
            <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-center text-sm text-neutral-500">
                Nothing cooked yet — log a cook in the Pantry tab, and it shows up here ready to weigh out.
            </p>
        )
    }

    const chip = (src: Source) => {
        const on = lines.some((l) => l.key === src.key)
        return (
            <button
                key={src.key}
                type="button"
                disabled={on}
                onClick={() => setLines((prev) => [...prev, { key: src.key, grams: '' }])}
                className={`inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-left text-[13px] font-medium transition-colors ${
                    on
                        ? 'bg-neutral-900 text-white'
                        : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                }`}
            >
                <i
                    className={`fa-solid ${on ? 'fa-check' : src.cook ? 'fa-box' : 'fa-plus'} shrink-0 text-[11px]`}
                    aria-hidden="true"
                />
                <span className="truncate">{src.label}</span>
                {src.left != null && (
                    <span className={`shrink-0 tabular-nums ${on ? 'text-white/70' : 'text-neutral-400'}`}>
                        ~{fmt(src.left)} g
                    </span>
                )}
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">From the pantry</p>
                {batches.length > 0 ? (
                    <div className="flex flex-wrap gap-2">{batches.map(chip)}</div>
                ) : (
                    <p className="text-xs text-neutral-500">Nothing cooked — log a cook in the Pantry tab.</p>
                )}
            </div>

            {plain.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Sides</p>
                    <div className="flex flex-wrap gap-2">{plain.map(chip)}</div>
                </div>
            )}

            {resolved.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {resolved.map((l, i) => {
                        const m = lineMacros(l.g, l.src.per100)
                        const over = l.src.left != null && l.g > l.src.left
                        return (
                            <li key={l.key} className="flex items-center gap-3 rounded-2xl border border-neutral-200 py-2.5 pl-3 pr-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-neutral-900">{l.src.label}</p>
                                    <p className={`text-xs tabular-nums ${over ? 'text-amber-700' : 'text-neutral-500'}`}>
                                        {kcal(m.calories)} kcal · {fmt(Math.round(m.protein))} g protein
                                        {over && ` · only ~${fmt(l.src.left!)} g left`}
                                    </p>
                                </div>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="any"
                                    placeholder="0"
                                    aria-label={`${l.src.label} grams`}
                                    autoFocus={i === resolved.length - 1}
                                    enterKeyHint="done"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                    }}
                                    value={l.grams}
                                    onChange={(e) => patch(i, e.target.value)}
                                    className={gramsInputCls}
                                />
                                <span className="text-sm text-neutral-500">g</span>
                                <button
                                    type="button"
                                    aria-label={`Take ${l.src.label} off the plate`}
                                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                                    className="grid h-11 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:text-neutral-700"
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}

            {resolved.length > 0 && <PlateTotal macros={total} />}

            <Button
                icon="fa-solid fa-plus"
                onClick={() => void submit()}
                disabled={busy || !ready}
                className="w-full justify-center"
            >
                {busy ? 'Adding…' : actionLabel}
            </Button>
        </div>
    )
}

/**
 * A plate's grams, editable — weigh what actually went on and type it in.
 * Each change saves when the field is left; the batch each line draws from
 * stays as it was.
 */
export function PlateLinesEditor({ lines, onChange }: { lines: PlateLine[]; onChange: (lines: PlateLine[]) => void }) {
    const [grams, setGrams] = useState(() => lines.map((l) => String(l.grams)))

    function commit() {
        const next = lines.map((l, i) => ({ ...l, grams: num(grams[i] ?? '') }))
        if (next.some((l, i) => l.grams !== lines[i].grams)) onChange(next)
    }

    const preview = plateTotal(lines.map((l, i) => ({ grams: num(grams[i] ?? ''), per100: l.per100 })))

    return (
        <div className="flex flex-col gap-3">
            <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                {lines.map((l, i) => {
                    const m = lineMacros(num(grams[i] ?? ''), l.per100)
                    const uncooked = !l.batch && l.per100.calories === 0
                    return (
                        <li key={i} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-neutral-900">{l.name}</p>
                                <p className={`text-xs tabular-nums ${uncooked ? 'text-amber-700' : 'text-neutral-500'}`}>
                                    {uncooked
                                        ? 'Not cooked yet — counts as 0'
                                        : `${kcal(m.calories)} kcal · ${fmt(Math.round(m.protein))} g protein`}
                                </p>
                            </div>
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                aria-label={`${l.name} grams`}
                                enterKeyHint="done"
                                value={grams[i] ?? ''}
                                onChange={(e) => setGrams((prev) => prev.map((g, j) => (j === i ? e.target.value : g)))}
                                onBlur={commit}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                }}
                                className={gramsInputCls}
                            />
                            <span className="text-sm text-neutral-500">g</span>
                        </li>
                    )
                })}
            </ul>
            <p className="px-1 text-xs text-neutral-500">
                Weigh what went on the plate and change the grams — the day’s totals follow. Now{' '}
                <span className="font-semibold tabular-nums text-neutral-800">{kcal(preview.calories)} kcal</span>.
            </p>
        </div>
    )
}
