import { useMemo, useState } from 'react'
import BottomSheet from '../BottomSheet'
import Button from '../Button'
import { fmt, kcal } from './format'
import { MEAL_TYPES, type Meal, type MealType } from '../../types'

export const CATEGORY_LABEL: Record<MealType, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
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
                    {(['all', ...MEAL_TYPES] as const).map((c) => (
                        <button
                            key={c}
                            type="button"
                            aria-pressed={filter === c}
                            onClick={() => setFilter(c)}
                            className={`min-h-[36px] shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                                filter === c ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600'
                            }`}
                        >
                            {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
                        </button>
                    ))}
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
                                className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-black/[0.06] active:bg-neutral-50 disabled:opacity-60"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-semibold text-neutral-900">{m.name}</span>
                                    <span className="block text-xs tabular-nums text-neutral-500">
                                        {kcal(m.macros.calories)} kcal · P {fmt(m.macros.protein)} · C {fmt(m.macros.carbs)} · F{' '}
                                        {fmt(m.macros.fat)}
                                    </span>
                                </span>
                                <i className="fa-solid fa-plus text-sm text-neutral-400" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </BottomSheet>
    )
}
