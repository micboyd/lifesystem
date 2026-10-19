import { useState } from 'react'
import Button from '../Button'
import { MacroBar, MacroLegend } from './mealUi'
import { fmt, kcal } from './format'
import { lineMacros, plateTotal, ZERO } from '../../lib/plates'
import { shortDate } from './BoxLibrary'
import type { Macros, MealPlanEntry, PlateFood, PlateLine, PlateLineInput } from '../../types'

/**
 * Plates: a meal weighed out from boxes and plain foods. The builder puts one
 * together in the day drawer; the lines editor changes a plate's grams at the
 * table. Both preview the numbers the server will store.
 */

/** "Chicken box 200 g · Rice 300 g" for a plate, the meal's name otherwise. */
export function plateTitle(entry: MealPlanEntry): string {
    if (!entry.plate?.length) return entry.name
    return entry.plate.map((l) => `${l.name} ${fmt(l.grams)} g`).join(' · ')
}

/** The figures a food counts at on a plate — a box's chosen (or newest) batch. */
function per100Of(food: PlateFood, batch?: string): Macros {
    if (food.kind === 'plain') return food.per100 ?? ZERO
    const cook = food.open.find((c) => c._id === batch) ?? food.open[0] ?? food.last
    return cook?.per100 ?? ZERO
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

type Draft = { food: string; grams: string; batch?: string }

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
    const byId = new Map(foods.map((f) => [f._id, f]))
    const ordered = [...foods].sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === 'box' ? -1 : 1))

    const resolved = lines.flatMap((l) => {
        const food = byId.get(l.food)
        return food ? [{ ...l, food, per100: per100Of(food, l.batch), g: num(l.grams) }] : []
    })
    const total = plateTotal(resolved.map((l) => ({ grams: l.g, per100: l.per100 })))
    const ready = resolved.some((l) => l.g > 0)

    function patch(i: number, p: Partial<Draft>) {
        setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...p } : l)))
    }

    async function submit() {
        if (!ready) return
        await onAdd(
            resolved
                .filter((l) => l.g > 0)
                .map((l) => ({ food: l.food._id, grams: l.g, ...(l.batch ? { batch: l.batch } : {}) }))
        )
        setLines([])
    }

    if (foods.length === 0) {
        return (
            <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-center text-sm text-neutral-500">
                Nothing to weigh yet — add your boxes and foods in Library → Boxes &amp; foods.
            </p>
        )
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Add to the plate</p>
                <div className="flex flex-wrap gap-2">
                    {ordered.map((f) => {
                        const on = lines.some((l) => l.food === f._id)
                        return (
                            <button
                                key={f._id}
                                type="button"
                                disabled={on}
                                onClick={() => setLines((prev) => [...prev, { food: f._id, grams: '' }])}
                                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                                    on
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                                }`}
                            >
                                <i
                                    className={`fa-solid ${on ? 'fa-check' : f.kind === 'box' ? 'fa-box' : 'fa-plus'} text-[11px]`}
                                    aria-hidden="true"
                                />
                                {f.name}
                            </button>
                        )
                    })}
                </div>
            </div>

            {resolved.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {resolved.map((l, i) => {
                        const f = l.food
                        const uncooked = f.kind === 'box' && !f.open.length && !f.last
                        const m = lineMacros(l.g, l.per100)
                        return (
                            <li key={f._id} className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-3">
                                <div className="flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-neutral-900">{f.name}</p>
                                        <p
                                            className={`text-xs tabular-nums ${uncooked ? 'text-amber-700' : 'text-neutral-500'}`}
                                        >
                                            {uncooked
                                                ? 'Not cooked yet — counts as 0 until you log a cook'
                                                : `${kcal(m.calories)} kcal · ${fmt(Math.round(m.protein))} g protein`}
                                        </p>
                                    </div>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="any"
                                        placeholder="0"
                                        aria-label={`${f.name} grams`}
                                        autoFocus={i === resolved.length - 1}
                                        value={l.grams}
                                        onChange={(e) => patch(i, { grams: e.target.value })}
                                        className={gramsInputCls}
                                    />
                                    <span className="text-sm text-neutral-500">g</span>
                                    <button
                                        type="button"
                                        aria-label={`Take ${f.name} off the plate`}
                                        onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                                        className="grid h-9 w-7 shrink-0 place-items-center rounded-lg text-neutral-300 transition-colors hover:text-neutral-600"
                                    >
                                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                                    </button>
                                </div>
                                {f.kind === 'box' && f.open.length > 1 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {f.open.map((c, n) => {
                                            const on = (l.batch ?? f.open[0]._id) === c._id
                                            return (
                                                <button
                                                    key={c._id}
                                                    type="button"
                                                    onClick={() => patch(i, { batch: n === 0 ? undefined : c._id })}
                                                    className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${
                                                        on
                                                            ? 'bg-neutral-900 text-white'
                                                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                                    }`}
                                                >
                                                    {shortDate(c.date)}’s batch
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
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
                        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
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
