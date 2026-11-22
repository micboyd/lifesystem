import { useState, useMemo } from 'react'
import Alert from '../Alert'
import BottomSheet from '../BottomSheet'
import ConfirmModal from '../ConfirmModal'
import Modal from '../Modal'
import Input from '../Input'
import DatePicker from '../DatePicker'
import { FIELD_LABEL } from '../fieldStyles'
import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import { Bar, BarButton, CAPS, Eyebrow } from '../Blok'
import { CATEGORY } from './mealUi'
import { fmt, shortDate } from './format'
import { useToast } from '../../context/ToastContext'
import { todayKey } from '../../lib/calendar'
import {
    BATCH_PORTIONS,
    WEEKDAYS,
    WEEKDAY_NAMES,
    cookList,
    copyDay,
    dayTotal,
    fillMenu,
    gapOf,
    rankForSlot,
    sortMenu,
    suits,
    weekAverage,
    type Gap,
} from '../../lib/planMenu'
import { MEAL_TYPES, type MacroGoals, type Macros, type Meal, type MealType, type MenuItem, type NutritionPhase } from '../../types'

/**
 * A plan's meal week, as a controlled editor: seven days of library meals,
 * Fill to land each day on the targets, swap / next best / remove per meal,
 * per-day copy and clear, and what the week needs cooking. Used by the plan
 * builder and by a plan's own meal week page, which saves it as it changes.
 */

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const
const MACRO_SHORT: Record<keyof Macros, string> = { calories: 'kcal', protein: 'P', carbs: 'C', fat: 'F' }
const MACRO_LONG: Record<keyof Macros, string> = { calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' }

const GAP_TEXT: Record<Gap, string> = {
    on: 'text-emerald-700',
    under: 'text-amber-700',
    over: 'text-red-700',
    none: 'text-neutral-600',
}
const GAP_BAR: Record<Gap, string> = {
    on: 'bg-emerald-600',
    under: 'bg-amber-500',
    over: 'bg-red-600',
    none: 'bg-neutral-400',
}

const unit = (k: keyof Macros) => (k === 'calories' ? '' : ' g')

type Picking = { day: number; slot: MealType; index?: number }

type FillStyle = 'mix' | 'batch'
const STYLE_KEY = 'nutrition.menuStyle'
function readStyle(): FillStyle {
    try {
        return localStorage.getItem(STYLE_KEY) === 'batch' ? 'batch' : 'mix'
    } catch {
        return 'mix'
    }
}

/** "a", "a or b", "a, b or c". */
function listWords(words: string[]): string {
    return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

export default function MealWeekBuilder({
    menu,
    onChange,
    meals,
    goals,
}: {
    menu: MenuItem[]
    onChange: (menu: MenuItem[]) => void
    meals: Meal[]
    goals: MacroGoals | null
}) {
    const toast = useToast()
    const [picking, setPicking] = useState<Picking | null>(null)
    const [acting, setActing] = useState<number | null>(null)
    const [confirmShuffle, setConfirmShuffle] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)
    const [style, setStyleState] = useState<FillStyle>(readStyle)
    const setStyle = (next: FillStyle) => {
        setStyleState(next)
        try {
            localStorage.setItem(STYLE_KEY, next)
        } catch {
            /* not remembered */
        }
    }
    const setMenu = (next: MenuItem[]) => onChange(sortMenu(next))

    const byId = useMemo(() => new Map(meals.map((m) => [m._id, m])), [meals])

    const mainSlots: MealType[] = ['breakfast', 'lunch', 'dinner']
    const emptyMains = [0, 1, 2, 3, 4, 5, 6].reduce(
        (n, d) => n + mainSlots.filter((s) => !menu.some((m) => m.day === d && m.slot === s)).length,
        0
    )
    const average = weekAverage(menu, byId)
    const cooking = cookList(menu, byId)
    const missing = menu.filter((m) => !byId.has(m.meal)).length
    const batch = style === 'batch'
    // Slots Fill can't touch because nothing in the Library suits them.
    const unfillable = MEAL_TYPES.filter((s) => !meals.some((m) => suits(m, s)))

    const fill = (days?: number[]) => {
        const next = fillMenu(menu, meals, goals, { days, seed: Date.now(), batch })
        const added = next.length - menu.length
        setMenu(next)
        if (added === 0) toast.show('Nothing to add — every slot already has a meal, or no meals suit them.', 'info')
    }

    const pick = (meal: Meal) => {
        if (!picking) return
        const item: MenuItem = { day: picking.day, slot: picking.slot, meal: meal._id }
        setMenu(picking.index === undefined ? [...menu, item] : menu.map((m, i) => (i === picking.index ? item : m)))
        setPicking(null)
    }

    const suggestNext = (index: number) => {
        const item = menu[index]
        const ranked = rankForSlot(menu, item.day, item.slot, meals, goals, byId, { ignore: item, batch }).filter(
            (r) => r.meal._id !== item.meal
        )
        if (ranked.length === 0) {
            toast.show('No other meal suits this slot.', 'info')
            return
        }
        setMenu(menu.map((m, i) => (i === index ? { ...m, meal: ranked[0].meal._id } : m)))
    }

    const weekMenu: MenuEntry[] = [
        { label: 'Fill again from scratch', icon: 'fa-solid fa-shuffle', onClick: () => (menu.length ? setConfirmShuffle(true) : fill()) },
        ...(menu.length ? [{ label: 'Clear the week', icon: 'fa-solid fa-eraser', danger: true, onClick: () => setConfirmClear(true) }] : []),
    ]

    return (
        <div>
            {/* How to fill, and Fill. */}
            <div className="flex flex-wrap items-center gap-3">
                <span className={`${CAPS} text-neutral-500`}>Fill for</span>
                <div role="radiogroup" aria-label="Fill style" className="inline-flex border border-neutral-300">
                    {(
                        [
                            ['mix', 'Variety'],
                            ['batch', 'Batch cooking'],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={style === key}
                            onClick={() => setStyle(key)}
                            className={`h-10 px-4 text-[13px] transition-colors ${
                                style === key ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <span className="min-w-0 flex-1 text-[13px] text-neutral-500">
                    {batch ? `Fewer meals, each eaten up to ${BATCH_PORTIONS} days.` : 'A different meal most days.'}
                </span>
                <div className="flex items-center gap-1">
                    {emptyMains > 0 && meals.length > 0 && (
                        <BarButton solid onClick={() => fill()}>
                            <i className="fa-solid fa-wand-magic-sparkles text-[11px]" aria-hidden="true" />
                            {menu.length ? 'Fill gaps' : 'Fill week'}
                        </BarButton>
                    )}
                    <DropdownMenu
                        align="right"
                        trigger={
                            <span
                                aria-label="Week actions"
                                className="grid h-11 w-11 place-items-center text-neutral-700 hover:bg-neutral-100 lg:h-10 lg:w-10"
                            >
                                <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                            </span>
                        }
                        items={weekMenu}
                    />
                </div>
            </div>

            <TargetStrip goals={goals} average={average} />

            {unfillable.length > 0 && meals.length > 0 && (
                <div className="mt-6">
                    <Alert variant="info">
                        Nothing in your Library is tagged {listWords(unfillable.map((s) => CATEGORY[s].label.toLowerCase()))}, so
                        Fill leaves {unfillable.length === 1 ? 'that slot' : 'those slots'} empty. Tag meals in the
                        Library, or tap a slot to pick any meal.
                    </Alert>
                </div>
            )}

            {missing > 0 && (
                <div className="mt-6">
                    <Alert variant="warning">
                        {missing} meal{missing === 1 ? ' is' : 's are'} no longer in your Library and count as
                        nothing. Swap or remove {missing === 1 ? 'it' : 'them'}.
                    </Alert>
                </div>
            )}

            {meals.length === 0 ? (
                <div className="mt-10 border-t border-neutral-900 py-12 text-center">
                    <p className="text-[17px]">Your Library is empty</p>
                    <p className="mt-2 text-sm text-neutral-600">Add some meals in Nutrition → Library first.</p>
                </div>
            ) : (
                <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-4 3xl:grid-cols-7">
                    {WEEKDAYS.map((_, day) => (
                        <DayColumn
                            key={day}
                            day={day}
                            menu={menu}
                            byId={byId}
                            goals={goals}
                            onAdd={(slot) => setPicking({ day, slot })}
                            onOpen={setActing}
                            onFill={() => fill([day])}
                            onCopy={(to) => setMenu(copyDay(menu, day, to))}
                            onClear={() => setMenu(menu.filter((m) => m.day !== day))}
                        />
                    ))}
                </div>
            )}

            {cooking.length > 0 && <CookSection lines={cooking} />}

            <MealPicker
                picking={picking}
                menu={menu}
                meals={meals}
                goals={goals}
                byId={byId}
                onPick={pick}
                onClose={() => setPicking(null)}
            />
            <ItemSheet
                index={acting}
                menu={menu}
                byId={byId}
                onClose={() => setActing(null)}
                onSwap={(index) => {
                    setActing(null)
                    const item = menu[index]
                    setPicking({ day: item.day, slot: item.slot, index })
                }}
                onSuggest={(index) => {
                    setActing(null)
                    suggestNext(index)
                }}
                onRemove={(index) => {
                    setActing(null)
                    setMenu(menu.filter((_, i) => i !== index))
                }}
            />
            <ConfirmModal
                open={confirmShuffle}
                title="Fill again from scratch?"
                message="Replaces every meal in the week with a fresh pick. Swaps you made by hand go too."
                confirmLabel="Fill again"
                onConfirm={() => {
                    setConfirmShuffle(false)
                    setMenu(fillMenu([], meals, goals, { seed: Date.now(), batch }))
                }}
                onClose={() => setConfirmShuffle(false)}
            />
            <ConfirmModal
                open={confirmClear}
                title="Clear the week?"
                message="Empties all seven days. Nothing already on the planner changes."
                confirmLabel="Clear"
                danger
                onConfirm={() => {
                    setConfirmClear(false)
                    setMenu([])
                }}
                onClose={() => setConfirmClear(false)}
            />
        </div>
    )
}

// ─── Targets ────────────────────────────────────────────────────────────────────

/** The plan's daily target beside what the week averages. */
function TargetStrip({ goals, average }: { goals: MacroGoals | null; average: Macros | null }) {
    if (!goals) {
        return (
            <div className="mt-8">
                <Alert variant="info">
                    This plan has no macro targets, so Fill picks for variety only. Add targets in the plan to fit
                    meals to them.
                </Alert>
            </div>
        )
    }
    return (
        <div className="mt-8 grid grid-cols-2 border-t border-neutral-900 sm:grid-cols-4">
            {MACRO_KEYS.map((k) => {
                const target = goals[k]
                const value = average?.[k] ?? 0
                const gap = average ? gapOf(value, target, k) : 'none'
                return (
                    <div key={k} className="border-b border-hairline py-4 pr-4 sm:border-b-0">
                        <p className={`${CAPS} text-neutral-500`}>{MACRO_LONG[k]}</p>
                        <p className="mt-1 text-[26px] font-normal tabular-nums tracking-[-0.02em]">
                            {target ? `${fmt(target)}${unit(k)}` : '—'}
                        </p>
                        <p className={`text-[13px] tabular-nums ${average ? GAP_TEXT[gap] : 'text-neutral-500'}`}>
                            {average ? `Week averages ${fmt(Math.round(value))}${unit(k)}` : 'Daily target'}
                        </p>
                    </div>
                )
            })}
        </div>
    )
}

// ─── A day ──────────────────────────────────────────────────────────────────────

function DayColumn({
    day,
    menu,
    byId,
    goals,
    onAdd,
    onOpen,
    onFill,
    onCopy,
    onClear,
}: {
    day: number
    menu: MenuItem[]
    byId: Map<string, Meal>
    goals: MacroGoals | null
    onAdd: (slot: MealType) => void
    onOpen: (index: number) => void
    onFill: () => void
    onCopy: (to: number[]) => void
    onClear: () => void
}) {
    const total = dayTotal(menu, day, byId)
    const items = menu.map((m, index) => ({ m, index })).filter(({ m }) => m.day === day)
    const kcalGap = gapOf(total.calories, goals?.calories, 'calories')
    const pct = goals?.calories ? Math.min(100, (total.calories / goals.calories) * 100) : 0

    const dayMenu: MenuEntry[] = [
        { label: 'Fill this day', icon: 'fa-solid fa-wand-magic-sparkles', onClick: onFill },
        ...(items.length
            ? ([
                  { label: 'Copy to every day', icon: 'fa-solid fa-clone', onClick: () => onCopy([0, 1, 2, 3, 4, 5, 6]) },
                  { label: 'Copy to weekdays', icon: 'fa-solid fa-briefcase', onClick: () => onCopy([0, 1, 2, 3, 4]) },
                  { label: 'Clear day', icon: 'fa-solid fa-eraser', danger: true, onClick: onClear },
              ] as MenuEntry[])
            : []),
    ]

    return (
        <section aria-label={WEEKDAY_NAMES[day]} className="flex flex-col">
            <div className="flex items-center gap-2 border-t border-neutral-900 pt-3">
                <h3 className="flex-1 text-[19px] font-medium">{WEEKDAY_NAMES[day]}</h3>
                <span className={`text-[13px] tabular-nums ${GAP_TEXT[kcalGap]}`}>
                    {fmt(Math.round(total.calories))}
                    {goals?.calories ? ` / ${fmt(goals.calories)}` : ''} kcal
                </span>
                <DropdownMenu
                    align="right"
                    trigger={
                        <span aria-label={`${WEEKDAY_NAMES[day]} actions`} className="grid h-9 w-9 place-items-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                        </span>
                    }
                    items={dayMenu}
                />
            </div>
            {goals?.calories ? <Bar pct={pct} color={GAP_BAR[kcalGap]} className="mt-2" /> : null}

            <div className="mt-3 flex flex-col">
                {MEAL_TYPES.map((slot) => {
                    const here = items.filter(({ m }) => m.slot === slot)
                    return (
                        <div key={slot} className="border-b border-hairline py-2">
                            <div className="flex items-center justify-between">
                                <p className={`${CAPS} text-neutral-500`}>{CATEGORY[slot].label}</p>
                                {here.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onAdd(slot)}
                                        aria-label={`Add to ${WEEKDAY_NAMES[day]} ${CATEGORY[slot].label}`}
                                        className="grid h-8 w-8 place-items-center text-[11px] text-neutral-400 hover:text-neutral-900"
                                    >
                                        <i className="fa-solid fa-plus" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                            {here.length === 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onAdd(slot)}
                                    className="mt-1 flex min-h-11 w-full items-center gap-2 border border-dashed border-neutral-300 px-3 text-left text-[13px] text-neutral-500 transition-colors hover:border-neutral-900 hover:text-neutral-900"
                                >
                                    <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                                    Add {CATEGORY[slot].label.toLowerCase()}
                                </button>
                            ) : (
                                <ul className="mt-1 flex flex-col gap-1">
                                    {here.map(({ m, index }) => {
                                        const meal = byId.get(m.meal)
                                        return (
                                            <li key={index}>
                                                <button
                                                    type="button"
                                                    onClick={() => onOpen(index)}
                                                    className={`flex min-h-14 w-full flex-col justify-center px-3 py-2 text-left transition-opacity hover:opacity-90 ${
                                                        meal ? CATEGORY[slot].tile : 'bg-neutral-100'
                                                    }`}
                                                >
                                                    <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-neutral-900">
                                                        {meal?.name ?? 'Deleted meal'}
                                                    </span>
                                                    {meal && (
                                                        <span className="mt-0.5 text-[12px] tabular-nums text-neutral-800">
                                                            {fmt(meal.macros.calories)} kcal · {fmt(meal.macros.protein)} g P
                                                            {meal.batchOf && meal.batchOf > 1 ? ' · tray' : ''}
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* The day's macros against the plan. */}
            {items.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums">
                    {(['protein', 'carbs', 'fat'] as const).map((k) => {
                        const gap = gapOf(total[k], goals?.[k], k)
                        return (
                            <span key={k} className={GAP_TEXT[gap]}>
                                {MACRO_SHORT[k]} {fmt(Math.round(total[k]))}
                                {goals?.[k] ? `/${fmt(goals[k]!)}` : ''} g
                            </span>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

// ─── Cook list ──────────────────────────────────────────────────────────────────

function CookSection({ lines }: { lines: ReturnType<typeof cookList> }) {
    return (
        <section className="mt-16 max-w-3xl">
            <Eyebrow>Each week</Eyebrow>
            <h2 className="mt-2 text-[26px] font-normal leading-[1.15] tracking-[-0.02em]">What the week needs</h2>
            <ul className="mt-5 border-t border-neutral-900">
                {lines.map((l) => (
                    <li key={l.meal._id} className="flex min-h-14 items-center gap-3 border-b border-hairline py-2">
                        <span className="min-w-0 flex-1 truncate text-[15px]">{l.meal.name}</span>
                        <span className="shrink-0 text-right text-[13px] tabular-nums text-neutral-600">
                            {l.trays !== null
                                ? `${l.trays} tray${l.trays === 1 ? '' : 's'} · ${l.portions} box${l.portions === 1 ? '' : 'es'}${l.spare ? ` · ${l.spare} spare` : ''}`
                                : `${l.portions} portion${l.portions === 1 ? '' : 's'}`}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

// ─── Picking a meal ─────────────────────────────────────────────────────────────

function MealPicker({
    picking,
    menu,
    meals,
    goals,
    byId,
    onPick,
    onClose,
}: {
    picking: Picking | null
    menu: MenuItem[]
    meals: Meal[]
    goals: MacroGoals | null
    byId: Map<string, Meal>
    onPick: (meal: Meal) => void
    onClose: () => void
}) {
    const [q, setQ] = useState('')
    const close = () => {
        setQ('')
        onClose()
    }

    const { fits, others } = useMemo(() => {
        if (!picking) return { fits: [], others: [] }
        const ignore = picking.index !== undefined ? menu[picking.index] : undefined
        const needle = q.trim().toLowerCase()
        const match = (m: Meal) => !needle || m.name.toLowerCase().includes(needle)
        const ranked = rankForSlot(menu, picking.day, picking.slot, meals, goals, byId, { ignore }).filter((r) => match(r.meal))
        const shown = new Set(ranked.map((r) => r.meal._id))
        return {
            fits: ranked,
            // Meals tagged for other slots, still best fit first — a dinner can be a big breakfast.
            others: rankForSlot(menu, picking.day, picking.slot, meals, goals, byId, { ignore, anySlot: true })
                .map((r) => r.meal)
                .filter((m) => !shown.has(m._id) && !suits(m, picking.slot) && match(m)),
        }
    }, [picking, menu, meals, goals, byId, q])

    const row = (meal: Meal, note?: string) => (
        <li key={meal._id} className="border-b border-hairline">
            <button
                type="button"
                onClick={() => {
                    setQ('')
                    onPick(meal)
                }}
                className="flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-neutral-50"
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">{meal.name}</span>
                    <span className="block truncate text-xs tabular-nums text-neutral-500">
                        {fmt(meal.macros.calories)} kcal · {fmt(meal.macros.protein)} P · {fmt(meal.macros.carbs)} C ·{' '}
                        {fmt(meal.macros.fat)} F{meal.batchOf && meal.batchOf > 1 ? ` · tray of ${meal.batchOf}` : ''}
                    </span>
                </span>
                {note && <span className={`${CAPS} shrink-0 text-[10px] text-emerald-700`}>{note}</span>}
            </button>
        </li>
    )

    return (
        <BottomSheet
            open={!!picking}
            onClose={close}
            title={picking ? `${WEEKDAY_NAMES[picking.day]} · ${CATEGORY[picking.slot].label}` : ''}
        >
            <div className="flex flex-col gap-3">
                <Input
                    aria-label="Search meals"
                    placeholder="Search your meals…"
                    icon="fa-solid fa-magnifying-glass"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                {fits.length === 0 && others.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-500">No meals match.</p>
                ) : (
                    <>
                        {fits.length > 0 && (
                            <div>
                                <p className={`${CAPS} mb-1 text-neutral-500`}>{goals ? 'Best fit first' : 'Suits this slot'}</p>
                                <ul className="flex flex-col border-t border-hairline">
                                    {fits.map((r, i) =>
                                        row(r.meal, goals && i === 0 && !q ? 'Best fit' : r.uses ? `${r.uses}× this week` : undefined)
                                    )}
                                </ul>
                            </div>
                        )}
                        {others.length > 0 && (
                            <div className="mt-2">
                                <p className={`${CAPS} mb-1 text-neutral-500`}>Other meals</p>
                                <ul className="flex flex-col border-t border-hairline">{others.map((m) => row(m))}</ul>
                            </div>
                        )}
                    </>
                )}
            </div>
        </BottomSheet>
    )
}

/** What can be done with one meal in the week. */
function ItemSheet({
    index,
    menu,
    byId,
    onClose,
    onSwap,
    onSuggest,
    onRemove,
}: {
    index: number | null
    menu: MenuItem[]
    byId: Map<string, Meal>
    onClose: () => void
    onSwap: (index: number) => void
    onSuggest: (index: number) => void
    onRemove: (index: number) => void
}) {
    const item = index !== null ? menu[index] : undefined
    const meal = item ? byId.get(item.meal) : undefined
    const action = (label: string, icon: string, onClick: () => void, danger = false) => (
        <button
            type="button"
            onClick={onClick}
            className={`flex min-h-14 w-full items-center gap-3 border-b border-hairline px-1 text-left text-[15px] transition-colors hover:bg-neutral-50 ${
                danger ? 'text-red-700' : 'text-neutral-900'
            }`}
        >
            <i className={`${icon} w-5 text-center text-[13px]`} aria-hidden="true" />
            {label}
        </button>
    )
    return (
        <BottomSheet open={index !== null} onClose={onClose} title={meal?.name ?? 'Deleted meal'}>
            {item && index !== null && (
                <div className="flex flex-col">
                    <p className="mb-3 text-[13px] text-neutral-600">
                        {WEEKDAY_NAMES[item.day]} · {CATEGORY[item.slot].label}
                        {meal &&
                            ` · ${fmt(meal.macros.calories)} kcal · ${fmt(meal.macros.protein)} P · ${fmt(meal.macros.carbs)} C · ${fmt(meal.macros.fat)} F`}
                    </p>
                    <div className="border-t border-hairline">
                        {action('Swap for another…', 'fa-solid fa-right-left', () => onSwap(index))}
                        {action('Next best fit', 'fa-solid fa-wand-magic-sparkles', () => onSuggest(index))}
                        {action('Remove', 'fa-solid fa-trash-can', () => onRemove(index), true)}
                    </div>
                </div>
            )}
        </BottomSheet>
    )
}

// ─── Putting it on the planner ─────────────────────────────────────────────────

export function ApplyModal({
    open,
    plan,
    onClose,
    onApply,
}: {
    open: boolean
    plan: NutritionPhase
    onClose: () => void
    onApply: (from: string) => Promise<void>
}) {
    const today = todayKey()
    const start = plan.startDate > today ? plan.startDate : today
    const [from, setFrom] = useState(start)
    const [busy, setBusy] = useState(false)

    const past = from > plan.endDate
    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Put on the planner"
            size="sm"
            footer={
                <div className="flex justify-end gap-2">
                    <BarButton onClick={onClose} className="!border-neutral-300">
                        Cancel
                    </BarButton>
                    <BarButton
                        solid
                        disabled={busy || past}
                        onClick={() => {
                            setBusy(true)
                            void onApply(from).finally(() => setBusy(false))
                        }}
                    >
                        {busy ? 'Adding…' : 'Put on planner'}
                    </BarButton>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <span className={FIELD_LABEL}>From</span>
                    <DatePicker
                        value={from}
                        minDate={plan.startDate}
                        maxDate={plan.endDate}
                        clearable={false}
                        onChange={(v) => typeof v === 'string' && setFrom(v)}
                    />
                </div>
                <p className="text-[14px] leading-normal text-neutral-700">
                    Copies the week onto every day from {shortDate(from)} to {shortDate(plan.endDate)}. Meals this plan
                    put there before are replaced; anything you planned, ate or marked away yourself stays, and that slot
                    is skipped.
                </p>
                {past && <p className="text-[13px] text-red-700">That’s after the plan ends.</p>}
            </div>
        </Modal>
    )
}
