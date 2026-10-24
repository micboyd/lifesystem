import { useState } from 'react'
import Button from '../Button'
import { MACRO_DOT, MacroBar } from './mealUi'
import { fmt, kcal } from './format'
import { gramsLeft, lineMacros, plateTotal, ZERO } from '../../lib/plates'
import { suggestGrams } from '../../lib/plateSuggest'
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

const MACROS = ['protein', 'carbs', 'fat'] as const

/**
 * Protein, carbs and fat in three fixed columns, so numbers never wrap onto a
 * line of their own. With an aim, each shows "67 / 57 g".
 */
function MacroGrid({ macros, aim, keys }: { macros?: Macros; aim?: Macros | null; keys?: (keyof Macros)[] }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {MACROS.map((k) => {
                const target = aim && (!keys || keys.includes(k)) ? Math.round(aim[k]) : null
                return (
                    <div key={k} className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${MACRO_DOT[k]}`} aria-hidden="true" />
                            {k[0].toUpperCase() + k.slice(1)}
                        </p>
                        <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-neutral-900">
                            {macros ? fmt(Math.round(macros[k])) : target != null ? fmt(target) : '—'}
                            {macros && target != null && <span className="font-normal text-neutral-400"> / {fmt(target)}</span>}
                            {(macros || target != null) && <span className="font-normal text-neutral-500"> g</span>}
                        </p>
                    </div>
                )
            })}
        </div>
    )
}

function PlateTotal({ macros, aim, keys }: { macros: Macros; aim?: Macros | null; keys?: (keyof Macros)[] }) {
    return (
        <div className="flex flex-col gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Plate</span>
                <span className="whitespace-nowrap text-lg font-semibold tabular-nums text-neutral-900">
                    {kcal(macros.calories)}
                    {aim && aim.calories > 0 && (
                        <span className="text-sm font-normal text-neutral-400"> / {kcal(aim.calories)}</span>
                    )}
                    <span className="text-sm font-normal text-neutral-500"> kcal</span>
                </span>
            </div>
            <MacroBar macros={macros} thick />
            <MacroGrid macros={macros} aim={aim} keys={keys} />
        </div>
    )
}

/**
 * What this slot should aim for, from the day's targets shared out as three
 * meals and a snack, less what the day already holds.
 */
export function AimCard({ aim, keys, slotLabel }: { aim: Macros; keys: (keyof Macros)[]; slotLabel: string }) {
    const done = keys.every((k) => aim[k] < (k === 'calories' ? 25 : 2))
    if (done) {
        return (
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                <i className="fa-solid fa-circle-check text-sm text-brand-600" aria-hidden="true" />
                <p className="text-sm font-semibold text-neutral-900">Today’s targets are already met</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                    <i className="fa-solid fa-bullseye" aria-hidden="true" />
                    <span className="truncate">{slotLabel} aim</span>
                </span>
                {keys.includes('calories') && (
                    <span className="whitespace-nowrap text-lg font-semibold tabular-nums text-neutral-900">
                        {kcal(aim.calories)}
                        <span className="text-sm font-normal text-neutral-500"> kcal</span>
                    </span>
                )}
            </div>
            {MACROS.some((k) => keys.includes(k)) && <MacroGrid aim={aim} keys={keys} />}
            <p className="text-[11px] text-neutral-500">What’s left of today, split over three meals and a snack.</p>
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
    // A plain food is always offered. With a batch out (a box of rice), it
    // draws from that, so the pantry knows what's left; it still counts at
    // the food's own figures.
    const plain = byOrder
        .filter((f) => f.kind === 'plain')
        .flatMap((f): Source[] =>
            f.open.length === 0
                ? [{ key: f._id, food: f, cook: null, label: f.name, per100: f.per100 ?? ZERO, left: null }]
                : f.open.map((c) => ({
                      key: c._id,
                      food: f,
                      cook: c,
                      label: f.open.length > 1 ? `${f.name} · ${shortDate(c.date)}` : f.name,
                      per100: f.per100 ?? ZERO,
                      left: gramsLeft(c.cookedGrams, c.eatenGrams),
                  }))
        )
    return { batches, plain }
}

type Draft = { key: string; grams: string }

export function PlateBuilder({
    foods,
    busy,
    actionLabel,
    aim,
    start,
    onAdd,
}: {
    foods: PlateFood[]
    busy: boolean
    actionLabel: string
    /** A box to start the plate with (its newest open batch) — weighing out a box note. */
    start?: string
    /** This slot's share of the day's targets, when there are targets. */
    aim?: { budget: Macros; keys: (keyof Macros)[] } | null
    onAdd: (plate: PlateLineInput[]) => Promise<void>
}) {
    const { batches, plain } = sourcesFrom(foods)
    const [lines, setLines] = useState<Draft[]>(() => {
        const src = start ? batches.find((b) => b.food._id === start) : undefined
        return src ? [{ key: src.key, grams: '' }] : []
    })
    const byKey = new Map([...batches, ...plain].map((src) => [src.key, src]))

    const resolved = lines.flatMap((l) => {
        const src = byKey.get(l.key)
        return src ? [{ ...l, src, g: num(l.grams) }] : []
    })
    const total = plateTotal(resolved.map((l) => ({ grams: l.g, per100: l.src.per100 })))
    const ready = resolved.some((l) => l.g > 0)

    // Blank lines get suggested grams (shown as the placeholder) around the
    // ones already typed. With everything typed, "Rebalance" re-fits them all.
    const blank = (l: Draft) => l.grams.trim() === ''
    const suggest = (keepTyped: boolean) =>
        aim
            ? suggestGrams(
                  resolved.map((l) => ({
                      per100: l.src.per100,
                      fixed: keepTyped && !blank(l) ? l.g : null,
                      max: l.src.left,
                  })),
                  aim.budget,
                  aim.keys
              )
            : null
    const suggested = suggest(true)
    const anyBlank = resolved.some(blank)

    function applySuggestion() {
        const grams = anyBlank ? suggested : suggest(false)
        if (!grams) return
        setLines(resolved.map((l, i) => ({ key: l.key, grams: anyBlank && !blank(l) ? l.grams : String(grams[i]) })))
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

    const add = (key: string) => setLines((prev) => [...prev, { key, grams: '' }])
    const remove = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key))
    const patch = (key: string, grams: string) =>
        setLines((prev) => prev.map((l) => (l.key === key ? { ...l, grams } : l)))

    // One row per food. Off the plate it's a tap target with what's left;
    // on it, the same row grows a grams box and the line's numbers.
    const row = (src: Source) => {
        const i = resolved.findIndex((l) => l.key === src.key)
        if (i < 0) {
            return (
                <li key={src.key}>
                    <button
                        type="button"
                        onClick={() => add(src.key)}
                        className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-left transition-colors hover:bg-neutral-50"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-neutral-800">{src.label}</span>
                            <span className="block truncate text-xs tabular-nums text-neutral-500">
                                {kcal(src.per100.calories)} kcal / 100 g
                                {src.left != null && ` · ~${fmt(src.left)} g left`}
                            </span>
                        </span>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600">
                            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                        </span>
                    </button>
                </li>
            )
        }
        const l = resolved[i]
        const m = lineMacros(l.g, src.per100)
        const over = src.left != null && l.g > src.left
        return (
            <li key={src.key} className="flex items-center gap-2 rounded-2xl border border-neutral-900 bg-white py-2 pl-3 pr-1">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900">{src.label}</p>
                    <p className={`truncate text-xs tabular-nums ${over ? 'text-amber-700' : 'text-neutral-500'}`}>
                        {over
                            ? `Only ~${fmt(src.left!)} g left`
                            : `${kcal(m.calories)} kcal · ${fmt(Math.round(m.protein))} g protein`}
                    </p>
                </div>
                <label className="relative shrink-0">
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        placeholder={suggested && blank(l) ? String(suggested[i]) : '0'}
                        aria-label={`${src.label} grams`}
                        autoFocus={l.key === lines[lines.length - 1]?.key}
                        enterKeyHint="done"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        value={l.grams}
                        onChange={(e) => patch(src.key, e.target.value)}
                        className={`${gramsInputCls} w-24 pr-7`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-neutral-500">g</span>
                </label>
                <button
                    type="button"
                    aria-label={`Take ${src.label} off the plate`}
                    onClick={() => remove(src.key)}
                    className="grid h-11 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
            </li>
        )
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">From the pantry</p>
                {batches.length > 0 ? (
                    <ul className="flex flex-col gap-2">{batches.map(row)}</ul>
                ) : (
                    <p className="text-xs text-neutral-500">Nothing cooked — log a cook in the Pantry tab.</p>
                )}
            </div>

            {plain.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Sides</p>
                    <ul className="flex flex-col gap-2">{plain.map(row)}</ul>
                </div>
            )}

            {aim && resolved.length > 0 && (
                <Button
                    variant="secondary"
                    icon="fa-solid fa-wand-magic-sparkles"
                    onClick={applySuggestion}
                    className="w-full justify-center"
                >
                    {anyBlank ? 'Fill in suggested grams' : 'Rebalance to hit the aim'}
                </Button>
            )}

            {resolved.length > 0 && <PlateTotal macros={total} aim={aim?.budget} keys={aim?.keys} />}

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
