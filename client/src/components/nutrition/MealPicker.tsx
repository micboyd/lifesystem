import { useMemo, useState } from 'react'
import BottomSheet from '../BottomSheet'
import Button from '../Button'
import { kcal } from './format'
import { CATEGORY, CategoryIcon, MacroBar, MacroLegend } from './mealUi'
import { MEAL_TYPES, type Meal, type MealType } from '../../types'

export const CATEGORY_LABEL: Record<MealType, string> = {
    breakfast: CATEGORY.breakfast.label,
    lunch: CATEGORY.lunch.label,
    dinner: CATEGORY.dinner.label,
    snack: CATEGORY.snack.label,
}

/**
 * Choose a meal from the library. Opens on the relevant category (lunch when
 * adding to lunch), with a search box and a way to see everything.
 *
 * `multi` keeps the sheet open after each pick — for "Log more", where it's
 * often a coffee and a biscuit, not one thing.
 */
export default function MealPicker({
    open,
    title,
    meals,
    category,
    multi = false,
    onPick,
    onClose,
}: {
    open: boolean
    title: string
    meals: Meal[]
    /** The category to open on; null opens on everything. */
    category: MealType | null
    multi?: boolean
    onPick: (meal: Meal) => Promise<void>
    onClose: () => void
}) {
    const [filter, setFilter] = useState<MealType | 'all'>('all')
    const [search, setSearch] = useState('')
    const [added, setAdded] = useState<string[]>([])
    const [busy, setBusy] = useState(false)

    // Reset each time the sheet opens.
    const [wasOpen, setWasOpen] = useState(false)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            setFilter(category ?? 'all')
            setSearch('')
            setAdded([])
        }
    }

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase()
        return meals.filter(
            (m) =>
                (q ? true : filter === 'all' || m.types.includes(filter)) &&
                (!q || m.name.toLowerCase().includes(q))
        )
    }, [meals, filter, search])

    async function pick(meal: Meal) {
        if (busy) return
        setBusy(true)
        try {
            await onPick(meal)
            if (multi) setAdded((a) => [...a, meal.name])
            else onClose()
        } finally {
            setBusy(false)
        }
    }

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={title}
            footer={
                multi ? (
                    <div className="flex items-center gap-3">
                        <p className="min-w-0 flex-1 truncate text-sm text-neutral-500">
                            {added.length === 0 ? 'Tap everything you ate.' : `Added: ${added.join(', ')}`}
                        </p>
                        <Button onClick={onClose} className="min-h-[48px]">
                            Done
                        </Button>
                    </div>
                ) : undefined
            }
        >
            <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-white px-4 pb-3 sm:-mx-5 sm:px-5">
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search meals"
                    className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm focus:border-neutral-900 focus:outline-none"
                />
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {(['all', ...MEAL_TYPES] as const).map((c) => {
                        const on = filter === c
                        const meta = c === 'all' ? null : CATEGORY[c]
                        return (
                            <button
                                key={c}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setFilter(c)}
                                className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                                    on
                                        ? meta
                                            ? `${meta.tile} ${meta.text} ring-2 ${meta.ring}`
                                            : 'bg-neutral-950 text-white'
                                        : 'bg-neutral-100 text-neutral-600'
                                }`}
                            >
                                {meta && <i className={`${meta.icon} text-xs`} aria-hidden="true" />}
                                {c === 'all' ? 'All' : meta!.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                    {meals.length === 0 ? 'Your library is empty — add meals in the Library tab.' : 'No meals match.'}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {shown.map((m) => (
                        <li key={m._id}>
                            <button
                                type="button"
                                onClick={() => void pick(m)}
                                disabled={busy}
                                className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 text-left ring-1 ring-black/[0.06] transition-colors active:bg-neutral-50 disabled:opacity-60"
                            >
                                {m.types[0] ? (
                                    <CategoryIcon type={m.types[0]} />
                                ) : (
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-sm text-neutral-400" aria-hidden="true">
                                        <i className="fa-solid fa-utensils" />
                                    </span>
                                )}
                                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <span className="flex items-baseline gap-2">
                                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-neutral-900">{m.name}</span>
                                        <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-900">
                                            {kcal(m.macros.calories)}
                                            <span className="ml-0.5 text-[10px] font-medium text-neutral-400">kcal</span>
                                        </span>
                                    </span>
                                    <MacroBar macros={m.macros} />
                                    <MacroLegend macros={m.macros} compact />
                                </span>
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs text-neutral-500" aria-hidden="true">
                                    <i className="fa-solid fa-plus" />
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </BottomSheet>
    )
}
