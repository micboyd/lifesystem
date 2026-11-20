import { useState } from 'react'
import Input from '../Input'
import { plural } from './ShoppingList'
import { MACRO_DOT } from './mealUi'
import { boxMacros } from '../../lib/sideMacros'
import { potShare } from '../../lib/mealAim'
import { lineKey, trayOf, traysFor } from '../../lib/shopping'
import type { SideMarks } from './useSideMarks'
import type { Meal, ShoppingGroup } from '../../types'

/**
 * Portioning: weigh each pot after cooking, and it says how much to put in
 * each box. One pot for the main, one for each ingredient marked Side on the
 * shopping list. Boxes = the count on the shopping list. Weights are only
 * remembered on this device.
 */

const KEY = (id: string) => `nutrition.cookedWeight.${id}`

/** Cooked weights typed for one meal: the main's, and each side's by line key. */
type Saved = { main: string; weights: Record<string, string>; extra: string[] }

function readSaved(id: string): Saved {
    try {
        const raw = localStorage.getItem(KEY(id))
        if (!raw) return { main: '', weights: {}, extra: [] }
        if (/^\d+$/.test(raw)) return { main: raw, weights: {}, extra: [] }
        const v = JSON.parse(raw)
        return {
            main: typeof v.main === 'string' ? v.main : '',
            weights: { ...(v.weights ?? {}) },
            extra: Array.isArray(v.extra) ? v.extra : [],
        }
    } catch {
        return { main: '', weights: {}, extra: [] }
    }
}

function writeSaved(id: string, v: Saved) {
    try {
        localStorage.setItem(KEY(id), JSON.stringify(v))
    } catch {
        /* private window: just not remembered */
    }
}

const digits = (v: string) => v.replace(/[^\d]/g, '').slice(0, 6)
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB')

/** "Chicken pot [ 1700 g ]  →  425 g each" */
function PotLine({
    id,
    label,
    value,
    boxes,
    onChange,
    onRemove,
}: {
    id: string
    label: string
    value: string
    boxes: number
    onChange: (v: string) => void
    onRemove?: () => void
}) {
    const each = potShare(Number(value), boxes)
    return (
        <li className="flex items-center gap-3 py-3">
            <label htmlFor={id} className="min-w-0 flex-1 text-sm text-neutral-800">
                {label}
            </label>
            <div className="relative w-24 shrink-0">
                <Input
                    id={id}
                    inputMode="numeric"
                    enterKeyHint="done"
                    placeholder="Weigh"
                    value={value}
                    onChange={(e) => onChange(digits(e.target.value))}
                    className="text-right tabular-nums" wrapperClassName="w-full"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-neutral-500">
                    g
                </span>
            </div>
            <i
                className="fa-solid fa-arrow-right shrink-0 text-xs text-neutral-300"
                aria-hidden="true"
            />
            <span className="w-20 shrink-0 text-right" aria-live="polite">
                {each > 0 ? (
                    <>
                        <span className="block text-lg font-medium leading-tight tabular-nums text-neutral-950">
                            {fmt(each)} g
                        </span>
                        <span className="block text-[11px] text-neutral-500">per box</span>
                    </>
                ) : (
                    <span className="text-lg text-neutral-300">—</span>
                )}
            </span>
            {onRemove ? (
                <button
                    type="button"
                    aria-label={`Take ${label} off`}
                    onClick={onRemove}
                    className="-mr-2 grid h-11 w-7 shrink-0 place-items-center text-neutral-400 hover:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
                </button>
            ) : (
                <span className="-mr-2 w-7 shrink-0" />
            )}
        </li>
    )
}

function PortionCard({
    group,
    meal,
    marks,
}: {
    group: ShoppingGroup
    meal: Meal
    marks: SideMarks
}) {
    const [saved, setSaved] = useState(() => readSaved(group.id))
    const [adding, setAdding] = useState<string | null>(null)
    const update = (patch: Partial<Saved>) => {
        const next = { ...saved, ...patch }
        setSaved(next)
        writeSaved(group.id, next)
    }

    const tray = trayOf(group)
    const boxes = tray ? traysFor(group.count, tray) * tray : group.count
    // Sides: ingredients marked Side on the shopping list, plus any added here.
    const fromList = meal.ingredients.filter((i) => marks.isSide(i.name)).map((i) => i.name)
    const sides = [
        ...fromList,
        ...saved.extra.filter((x) => !fromList.some((n) => lineKey(n) === lineKey(x))),
    ]
    const m = meal.macros

    const pots = [
        { key: 'main', label: sides.length ? 'Main' : 'The pot', value: saved.main },
        ...sides.map((name) => ({
            key: lineKey(name),
            label: name,
            value: saved.weights[lineKey(name)] ?? '',
        })),
    ].map((p) => ({ ...p, each: potShare(Number(p.value), boxes) }))

    // The box's macros: the main's share of the recipe, plus each side as weighed.
    const box = boxMacros(
        m,
        sides.map((name) => {
            const ing = meal.ingredients.find((i) => lineKey(i.name) === lineKey(name))
            const pot = pots.find((p) => p.key === lineKey(name))
            return {
                name,
                recipeGrams: ing ? ing.grams / (tray ?? 1) : null,
                boxGrams: pot && pot.each > 0 ? pot.each : null,
            }
        })
    )

    function removeSide(name: string) {
        if (fromList.includes(name)) marks.setSide(name, false)
        else update({ extra: saved.extra.filter((x) => x !== name) })
    }
    function addSide() {
        const name = (adding ?? '').trim()
        setAdding(null)
        if (!name || sides.some((n) => lineKey(n) === lineKey(name))) return
        const ingredient = meal.ingredients.find((i) => lineKey(i.name) === lineKey(name))
        if (ingredient) marks.setSide(ingredient.name, true)
        else update({ extra: [...saved.extra, name] })
    }

    return (
        <li className="flex flex-col border-t border-neutral-900">
            <div className="pt-5">
                <p className="text-[17px] font-medium text-neutral-900">{meal.name}</p>
                <p className="mt-0.5 text-[13px] text-neutral-600">
                    {plural(boxes, 'box', 'boxes')} · weigh each pot once it’s cooked
                </p>
                <ul className="mt-2 divide-y divide-hairline border-t border-hairline">
                    {pots.map((p) => (
                        <PotLine
                            key={p.key}
                            id={`pot-${group.id}-${p.key}`}
                            label={p.label}
                            value={p.value}
                            boxes={boxes}
                            onChange={(v) =>
                                p.key === 'main'
                                    ? update({ main: v })
                                    : update({ weights: { ...saved.weights, [p.key]: v } })
                            }
                            onRemove={p.key === 'main' ? undefined : () => removeSide(p.label)}
                        />
                    ))}
                </ul>
                <div className="border-t border-hairline py-1">
                    {adding === null ? (
                        <button
                            type="button"
                            onClick={() => setAdding('')}
                            className="flex min-h-11 items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                            Add a side (rice, pasta…)
                        </button>
                    ) : (
                        <form
                            className="py-1.5"
                            onSubmit={(e) => {
                                e.preventDefault()
                                addSide()
                            }}
                        >
                            <Input
                                autoFocus
                                aria-label="Side name"
                                placeholder="Rice, pasta, potatoes…"
                                enterKeyHint="done"
                                value={adding}
                                onChange={(e) => setAdding(e.target.value)}
                                onBlur={addSide}
                                wrapperClassName="w-full"
                            />
                        </form>
                    )}
                </div>
            </div>

            <div className="mt-auto bg-neutral-100/70">
                <dl className="grid grid-cols-4 divide-x divide-neutral-200/70">
                    {(
                        [
                            {
                                key: 'kcal',
                                label: 'kcal',
                                value: fmt(box.total.calories),
                                dot: null,
                            },
                            {
                                key: 'protein',
                                label: 'protein',
                                value: `${fmt(box.total.protein)} g`,
                                dot: MACRO_DOT.protein,
                            },
                            {
                                key: 'carbs',
                                label: 'carbs',
                                value: `${fmt(box.total.carbs)} g`,
                                dot: MACRO_DOT.carbs,
                            },
                            {
                                key: 'fat',
                                label: 'fat',
                                value: `${fmt(box.total.fat)} g`,
                                dot: MACRO_DOT.fat,
                            },
                        ] as const
                    ).map((t) => (
                        <div
                            key={t.key}
                            className="flex flex-col-reverse items-center gap-1 px-1 py-4"
                        >
                            <dt className="flex items-center gap-1.5 text-xs text-neutral-500">
                                {t.dot && (
                                    <span
                                        className={`h-2 w-2 rounded-full ${t.dot}`}
                                        aria-hidden="true"
                                    />
                                )}
                                {t.label}
                            </dt>
                            <dd className="text-[22px] leading-none tracking-[-0.03em] tabular-nums text-neutral-950 sm:text-[26px]">
                                {t.value}
                            </dd>
                        </div>
                    ))}
                </dl>
                {box.sides.some((x) => x.from === 'unknown') && (
                    <p className="border-t border-hairline px-4 py-2 text-xs text-amber-700">
                        No figures for{' '}
                        {box.sides
                            .filter((x) => x.from === 'unknown')
                            .map((x) => x.name)
                            .join(', ')}{' '}
                        — not counted.
                    </p>
                )}
            </div>
        </li>
    )
}

export default function Portioning({
    cooking,
    byId,
    sides,
}: {
    cooking: ShoppingGroup[]
    byId: Map<string, Meal>
    sides: SideMarks
}) {
    const rows = cooking
        .map((g) => ({ g, meal: g.ref ? byId.get(g.ref) : undefined }))
        .filter((r): r is { g: ShoppingGroup; meal: Meal } => !!r.meal)
    if (rows.length === 0) return null

    return (
        <ul className="flex flex-col gap-10">
                {rows.map(({ g, meal }) => (
                    <PortionCard key={g.id} group={g} meal={meal} marks={sides} />
                ))}
        </ul>
    )
}
