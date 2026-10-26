import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import { StatStrip } from '../session/SessionUI'
import { fmt, kcal } from './format'
import { lineMacros, plateTotal } from '../../lib/plates'
import type { BoxProjection } from '../../lib/plateSuggest'
import type { MealPlanEntry, PlateFood, PlateLineInput } from '../../types'

/**
 * Eating a box meal: its box and sides, each with the suggested grams already
 * in. "Ate this" logs it as it stands — change any grams first if the plate
 * came out different. A box that isn't cooked yet can't go on a plate.
 */
export function WeighOutDrawer({
    entry,
    projection,
    foods,
    onClose,
    onLog,
    onMore,
}: {
    entry: MealPlanEntry | null
    projection?: BoxProjection
    foods: PlateFood[]
    onClose: () => void
    onLog: (plate: PlateLineInput[]) => Promise<void>
    /** Open the full plate builder instead — to add something else. */
    onMore: () => void
}) {
    const [view, setView] = useState<MealPlanEntry | null>(entry)
    const [grams, setGrams] = useState<Record<string, string>>({})
    const [busy, setBusy] = useState(false)

    const [openedFor, setOpenedFor] = useState<string | null>(null)

    // Retain the last entry while the drawer animates closed.
    if (entry && entry !== view) setView(entry)
    // Opened on a meal: start from the suggested grams. (A projection that
    // shifts while it's open keeps what's typed.)
    if (entry && entry._id !== openedFor) {
        setOpenedFor(entry._id)
        const start: Record<string, string> = {}
        for (const l of projection?.lines ?? []) start[l.food] = String(l.grams)
        setGrams(start)
        setBusy(false)
    }
    if (!entry && openedFor) setOpenedFor(null)

    const ids = view?.box ? [view.box, ...(view.sides ?? [])] : []
    const lines = ids.flatMap((id) => {
        const food = foods.find((f) => f._id === id)
        if (!food) return []
        // The newest batch in use — a plain food's too, so the pantry knows what's left.
        const cook = food.open[0] ?? null
        const per100 = food.kind === 'box' ? cook?.per100 : food.per100
        const g = Number(grams[id] ?? '')
        return [{ id, food, cook, per100, grams: Number.isFinite(g) && g > 0 ? g : 0 }]
    })
    const ready = lines.filter((l) => l.per100 && l.grams > 0)
    const total = plateTotal(ready.map((l) => ({ grams: l.grams, per100: l.per100! })))

    async function log() {
        if (ready.length === 0) return
        setBusy(true)
        try {
            await onLog(
                ready.map((l) => ({
                    food: l.id,
                    grams: l.grams,
                    ...(l.cook ? { batch: l.cook._id } : {}),
                }))
            )
            onClose()
        } finally {
            setBusy(false)
        }
    }

    return (
        <Drawer
            open={!!entry}
            onClose={onClose}
            title="Ate this?"
            badge={view?.name}
            footer={
                <>
                    <Button variant="ghost" onClick={onMore}>
                        Add something else
                    </Button>
                    <Button
                        icon="fa-solid fa-check"
                        onClick={() => void log()}
                        disabled={busy || ready.length === 0}
                    >
                        {busy ? 'Saving…' : 'Ate this'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    {projection
                        ? 'The suggested portion is filled in. Weighed something different? Change the grams.'
                        : 'Weigh it out and type the grams.'}
                </p>
                <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                    {lines.map((l) => {
                        const m = l.per100 ? lineMacros(l.grams, l.per100) : null
                        return (
                            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-neutral-900">
                                        {l.food.name}
                                    </p>
                                    <p
                                        className={`truncate text-xs tabular-nums ${
                                            m ? 'text-neutral-500' : 'text-amber-700'
                                        }`}
                                    >
                                        {m
                                            ? `${kcal(m.calories)} kcal · ${fmt(Math.round(m.protein))} g protein`
                                            : 'Not cooked yet — cook it first, or leave it off'}
                                    </p>
                                </div>
                                <label className="relative shrink-0">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="any"
                                        enterKeyHint="done"
                                        aria-label={`${l.food.name} grams`}
                                        disabled={!l.per100}
                                        value={grams[l.id] ?? ''}
                                        placeholder="0"
                                        onChange={(e) =>
                                            setGrams((prev) => ({
                                                ...prev,
                                                [l.id]: e.target.value,
                                            }))
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter')
                                                (e.target as HTMLInputElement).blur()
                                        }}
                                        className="h-11 w-24 rounded-xl bg-white pl-3 pr-7 text-right text-sm font-semibold tabular-nums text-neutral-900 outline-none ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
                                    />
                                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-neutral-500">
                                        g
                                    </span>
                                </label>
                            </li>
                        )
                    })}
                </ul>
                <StatStrip
                    stats={[
                        {
                            icon: 'fa-solid fa-fire',
                            label: 'Calories',
                            value: `${kcal(total.calories)} kcal`,
                        },
                        {
                            icon: 'fa-solid fa-drumstick-bite',
                            label: 'Protein',
                            value: `${fmt(Math.round(total.protein))} g`,
                        },
                        {
                            icon: 'fa-solid fa-wheat-awn',
                            label: 'Carbs',
                            value: `${fmt(Math.round(total.carbs))} g`,
                        },
                        {
                            icon: 'fa-solid fa-droplet',
                            label: 'Fat',
                            value: `${fmt(Math.round(total.fat))} g`,
                        },
                    ]}
                />
            </div>
        </Drawer>
    )
}
