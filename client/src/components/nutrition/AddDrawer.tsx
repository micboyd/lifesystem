import { useMemo, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Pagination from '../Pagination'
import { CATEGORY } from './mealUi'
import { fmt, kcal } from './format'
import {
    fitCost,
    projectBoxNotes,
    slotBudget,
    suggestGrams,
    type BoxProjection,
} from '../../lib/plateSuggest'
import { expectedPer100, gramsLeft, lineMacros, plateTotal } from '../../lib/plates'
import {
    addDays,
    eventCoversAllDay,
    eventCoversSlot,
    MONTHS,
    parseDateKey,
    todayKey,
    WEEKDAYS_LONG,
} from '../../lib/calendar'
import { MEAL_TYPES } from '../../types'
import type {
    Event,
    MacroGoals,
    Macros,
    Meal,
    MealPlanEntry,
    MealType,
    PlateFood,
    PlateLineInput,
} from '../../types'

/**
 * Adding to a day, one way for everything. A Planned / Eaten switch at the
 * top (planned for days ahead, eaten today and before), the slot, and the
 * slot's aim. Then one list: the saved meals that best fit the aim, your
 * boxes and foods (cooked or not), every saved meal, and "away".
 *
 * Picking a box or food opens one step: add sides, then —
 *   planned: an estimated portion, and the days to plan it for;
 *   eaten:   the grams, with the suggested ones a tap away.
 */

export type AddTarget = {
    date: string
    slot: MealType
    eaten: boolean
    /** Straight to marking the whole day away. */
    awayDay?: boolean
}

const PAGE_SIZE = 10

const LABEL = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'

function dayLabel(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return `${WEEKDAYS_LONG[new Date(year, month, day).getDay()].slice(0, 3)} ${day} ${MONTHS[month].slice(0, 3)}`
}

/** What a box or food has in the pantry, in a few words. */
function stockLine(f: PlateFood): string {
    const left = f.open.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)
    if (f.open.length > 0) return `~${fmt(left)} g in the fridge`
    if (f.frozen.length > 0) return 'In the freezer'
    if (f.kind === 'plain')
        return f.per100 ? `${kcal(f.per100.calories)} kcal / 100 g` : 'No figures yet'
    return 'Not cooked yet'
}

/** Whether it can go on a plate now: a box needs a batch out, a plain food just its figures. */
const plateable = (f: PlateFood) => (f.kind === 'box' ? f.open.length > 0 : !!f.per100)

export function AddDrawer({
    target,
    meals,
    foods,
    entries,
    projections,
    events,
    goalsFor,
    onClose,
    onAddMeal,
    onAddPlate,
    onAddBox,
    onAddAway,
    onAddAwayDay,
    copied,
    onPaste,
}: {
    onAddAwayDay: (date: string, name: string) => Promise<void>
    /** A meal copied elsewhere, offered first so it can be pasted here. */
    copied?: MealPlanEntry | null
    onPaste?: (date: string, slot: MealType) => Promise<void>
    target: AddTarget | null
    meals: Meal[]
    foods: PlateFood[]
    /** Everything on the target day. */
    entries: MealPlanEntry[]
    projections: Map<string, BoxProjection>
    /** Calendar events touching the day, offered for "away". */
    events: Event[]
    goalsFor: (date: string) => MacroGoals | null
    onClose: () => void
    onAddMeal: (date: string, slot: MealType, mealId: string, eaten: boolean) => Promise<void>
    onAddPlate: (
        date: string,
        slot: MealType,
        plate: PlateLineInput[],
        eaten: boolean
    ) => Promise<void>
    onAddBox: (box: string, slot: MealType, dates: string[], sides: string[]) => Promise<void>
    onAddAway: (date: string, slot: MealType, name: string) => Promise<void>
}) {
    const [view, setView] = useState<AddTarget | null>(target)
    const [eaten, setEaten] = useState(false)
    const [slot, setSlot] = useState<MealType>('breakfast')
    const [query, setQuery] = useState('')
    const [page, setPage] = useState(1)
    // The list, a box or food being set up, or "away".
    const [step, setStep] = useState<
        { kind: 'list' } | { kind: 'food'; id: string } | { kind: 'away' }
    >({
        kind: 'list',
    })
    const [busy, setBusy] = useState(false)

    // Opened on a slot: start fresh from it. (The last target stays on show
    // while the drawer slides shut.)
    if (target && target !== view) {
        setView(target)
        setEaten(target.eaten)
        setSlot(target.slot)
        setQuery('')
        setPage(1)
        setStep({ kind: 'list' })
        setBusy(false)
    }

    const date = view?.date ?? todayKey()
    const goals = goalsFor(date)
    // This slot's share of what's left of the day; box notes elsewhere count at their estimate.
    const dayEntries = entries.map((e) =>
        e.box ? { ...e, macros: projections.get(e._id)?.macros ?? e.macros } : e
    )
    const aim = slotBudget(goals, slot, dayEntries)
    const aimOpen = !!aim && aim.keys.some((k) => aim.budget[k] >= (k === 'calories' ? 25 : 2))

    async function run(fn: () => Promise<void>) {
        if (busy) return
        setBusy(true)
        try {
            await fn()
            onClose()
        } finally {
            setBusy(false)
        }
    }

    const awayDay = !!view?.awayDay
    const title = awayDay
        ? 'Away all day'
        : `${eaten ? 'Log' : 'Plan'} ${CATEGORY[slot].label.toLowerCase()}`

    return (
        <Drawer
            open={!!target}
            onClose={onClose}
            title={title}
            badge={view ? dayLabel(view.date) : undefined}
        >
            {view && awayDay && (
                <AwayStep
                    date={date}
                    slot={null}
                    events={events}
                    planned={
                        entries.filter((e) => !e.extra && e.status === 'planned' && !e.away).length
                    }
                    busy={busy}
                    onPick={(name) => run(() => onAddAwayDay(date, name))}
                />
            )}
            {view && !awayDay && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                            value={eaten ? 'eaten' : 'planned'}
                            options={[
                                ['planned', 'Planned'],
                                ['eaten', 'Eaten'],
                            ]}
                            onChange={(v) => setEaten(v === 'eaten')}
                        />
                        <Segmented
                            value={slot}
                            options={MEAL_TYPES.map(
                                (s) => [s, CATEGORY[s].label] as [MealType, string]
                            )}
                            onChange={(v) => setSlot(v)}
                        />
                    </div>

                    {aim && <AimLine aim={aim.budget} keys={aim.keys} open={aimOpen} />}

                    {step.kind === 'away' ? (
                        <AwayStep
                            date={date}
                            slot={slot}
                            events={events}
                            planned={
                                entries.filter(
                                    (e) =>
                                        e.slot === slot &&
                                        !e.extra &&
                                        e.status === 'planned' &&
                                        !e.away
                                ).length
                            }
                            busy={busy}
                            onBack={() => setStep({ kind: 'list' })}
                            onPick={(name) => run(() => onAddAway(date, slot, name))}
                        />
                    ) : step.kind === 'food' ? (
                        <FoodStep
                            key={`${step.id}|${eaten}`}
                            main={step.id}
                            foods={foods}
                            date={date}
                            slot={slot}
                            eaten={eaten}
                            entries={entries}
                            aim={aim}
                            goals={goals}
                            busy={busy}
                            onBack={() => setStep({ kind: 'list' })}
                            onPlan={(dates, sides) =>
                                run(() => onAddBox(step.id, slot, dates, sides))
                            }
                            onLog={(plate) => run(() => onAddPlate(date, slot, plate, true))}
                        />
                    ) : (
                        <ListStep
                            meals={meals}
                            foods={foods}
                            slot={slot}
                            eaten={eaten}
                            aim={aimOpen ? aim : null}
                            query={query}
                            page={page}
                            busy={busy}
                            onQuery={(q) => {
                                setQuery(q)
                                setPage(1)
                            }}
                            onPage={setPage}
                            onMeal={(m) => run(() => onAddMeal(date, slot, m._id, eaten))}
                            onFood={(id) => setStep({ kind: 'food', id })}
                            onAway={() => setStep({ kind: 'away' })}
                            copied={copied ?? null}
                            onPaste={onPaste ? () => run(() => onPaste(date, slot)) : undefined}
                        />
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Pieces ────────────────────────────────────────────────────────────────────

function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T
    options: [T, string][]
    onChange: (v: T) => void
}) {
    return (
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    aria-pressed={v === value}
                    onClick={() => onChange(v)}
                    className={`h-8 rounded-[9px] px-3 text-[13px] font-medium transition-all ${
                        v === value
                            ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.04]'
                            : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}

/** "Aim ~720 kcal · 57 g protein · …" — what's left of the day for this slot. */
function AimLine({ aim, keys, open }: { aim: Macros; keys: (keyof Macros)[]; open: boolean }) {
    if (!open) {
        return (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700">
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
                The day’s targets are already met
            </p>
        )
    }
    const parts = [
        keys.includes('calories') && `${kcal(aim.calories)} kcal`,
        keys.includes('protein') && `${fmt(Math.round(aim.protein))} g protein`,
        keys.includes('carbs') && `${fmt(Math.round(aim.carbs))} g carbs`,
        keys.includes('fat') && `${fmt(Math.round(aim.fat))} g fat`,
    ].filter(Boolean)
    return (
        <p className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-[13px] text-neutral-600">
            <i className="fa-solid fa-bullseye text-[11px] text-neutral-400" aria-hidden="true" />
            <span className="min-w-0">
                <span className="font-medium text-neutral-900">Aim</span> ~{parts.join(' · ')}
            </span>
        </p>
    )
}

function BackButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="-ml-1 inline-flex h-9 items-center gap-2 self-start rounded-lg px-1 text-[13px] font-semibold text-neutral-600 hover:text-neutral-900"
        >
            <i className="fa-solid fa-arrow-left text-[11px]" aria-hidden="true" />
            Back
        </button>
    )
}

function Row({
    title,
    detail,
    icon,
    disabled,
    onClick,
}: {
    title: string
    detail: string
    icon: string
    disabled?: boolean
    onClick: () => void
}) {
    return (
        <li>
            <button
                type="button"
                disabled={disabled}
                onClick={onClick}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-800">
                        {title}
                    </span>
                    <span className="block truncate text-xs tabular-nums text-neutral-500">
                        {detail}
                    </span>
                </span>
                <i className={`${icon} shrink-0 text-xs text-neutral-500`} aria-hidden="true" />
            </button>
        </li>
    )
}

// ─── The list ──────────────────────────────────────────────────────────────────

function ListStep({
    meals,
    foods,
    slot,
    eaten,
    aim,
    query,
    page,
    busy,
    onQuery,
    onPage,
    onMeal,
    onFood,
    onAway,
    copied,
    onPaste,
}: {
    copied: MealPlanEntry | null
    onPaste?: () => void
    meals: Meal[]
    foods: PlateFood[]
    slot: MealType
    eaten: boolean
    aim: ReturnType<typeof slotBudget>
    query: string
    page: number
    busy: boolean
    onQuery: (q: string) => void
    onPage: (p: number) => void
    onMeal: (m: Meal) => void
    onFood: (id: string) => void
    onAway: () => void
}) {
    const q = query.trim().toLowerCase()
    const match = (name: string) => !q || name.toLowerCase().includes(q)

    const sortedFoods = useMemo(
        () =>
            [...foods].sort((a, b) =>
                a.kind === b.kind ? a.order - b.order : a.kind === 'box' ? -1 : 1
            ),
        [foods]
    )
    const shownFoods = sortedFoods.filter((f) => match(f.name))

    // Saved meals tagged for the slot, or — searching — the whole library.
    const shownMeals = useMemo(() => {
        const base = q
            ? meals.filter((m) => match(m.name))
            : meals.filter((m) => m.types.includes(slot))
        return [...base].sort((a, b) => a.name.localeCompare(b.name))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meals, q, slot])
    const pageCount = Math.max(1, Math.ceil(shownMeals.length / PAGE_SIZE))
    const current = Math.min(page, pageCount)

    // The saved meals that come closest to the aim.
    const tagged = meals.filter((m) => m.types.includes(slot))
    const bestFit =
        !aim || q
            ? []
            : (tagged.length > 0 ? tagged : meals)
                  .map((m) => ({ m, cost: fitCost(m.macros, aim.budget, aim.keys, aim.size) }))
                  .sort((a, b) => a.cost - b.cost)
                  .slice(0, 3)
                  .map((x) => x.m)

    const mealDetail = (m: Meal) =>
        `${kcal(m.macros.calories)} kcal · ${fmt(Math.round(m.macros.protein))} g protein`

    return (
        <div className="flex flex-col gap-5">
            <Input
                icon="fa-solid fa-magnifying-glass"
                type="search"
                placeholder="Search meals, boxes and foods…"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
            />

            {copied && onPaste && !q && (
                <ul>
                    <Row
                        title={`Paste ${copied.name}`}
                        detail="The meal you copied"
                        icon="fa-solid fa-paste"
                        disabled={busy}
                        onClick={onPaste}
                    />
                </ul>
            )}

            {bestFit.length > 0 && (
                <section className="flex flex-col gap-2">
                    <p className={LABEL}>Best fit for the aim</p>
                    <ul className="flex flex-col gap-1.5">
                        {bestFit.map((m) => (
                            <Row
                                key={m._id}
                                title={m.name}
                                detail={`${mealDetail(m)} · ${fmt(Math.round(m.macros.carbs))} g carbs · ${fmt(Math.round(m.macros.fat))} g fat`}
                                icon="fa-solid fa-plus"
                                disabled={busy}
                                onClick={() => onMeal(m)}
                            />
                        ))}
                    </ul>
                </section>
            )}

            {shownFoods.length > 0 && (
                <section className="flex flex-col gap-2">
                    <p className={LABEL}>Boxes & foods</p>
                    <ul className="flex flex-col gap-1.5">
                        {shownFoods.map((f) => (
                            <Row
                                key={f._id}
                                title={f.name}
                                detail={
                                    eaten && !plateable(f)
                                        ? `${stockLine(f)} — can’t log it yet`
                                        : stockLine(f)
                                }
                                icon="fa-solid fa-chevron-right"
                                disabled={busy || (eaten && !plateable(f))}
                                onClick={() => onFood(f._id)}
                            />
                        ))}
                    </ul>
                </section>
            )}

            <section className="flex flex-col gap-2">
                <p className={LABEL}>
                    {q ? 'Saved meals' : `Saved ${CATEGORY[slot].label.toLowerCase()} meals`}
                </p>
                {shownMeals.length === 0 ? (
                    <p className="rounded-xl bg-neutral-50 px-3 py-3 text-center text-sm text-neutral-500">
                        {meals.length === 0
                            ? 'No saved meals yet — add some in the Library.'
                            : q
                              ? 'No meals found.'
                              : `None tagged ${CATEGORY[slot].label.toLowerCase()} — search to find any meal.`}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {shownMeals
                            .slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
                            .map((m) => (
                                <Row
                                    key={m._id}
                                    title={m.name}
                                    detail={mealDetail(m)}
                                    icon="fa-solid fa-plus"
                                    disabled={busy}
                                    onClick={() => onMeal(m)}
                                />
                            ))}
                    </ul>
                )}
                <Pagination page={current} pageCount={pageCount} onChange={onPage} />
            </section>

            {!q && (
                <ul>
                    <Row
                        title="Not eating here"
                        detail="Away at an event, or eating out — no meal in this slot"
                        icon="fa-regular fa-calendar"
                        disabled={busy}
                        onClick={onAway}
                    />
                </ul>
            )}
        </div>
    )
}

// ─── A box or food ─────────────────────────────────────────────────────────────

function FoodStep({
    main,
    foods,
    date,
    slot,
    eaten,
    entries,
    aim,
    goals,
    busy,
    onBack,
    onPlan,
    onLog,
}: {
    main: string
    foods: PlateFood[]
    date: string
    slot: MealType
    eaten: boolean
    entries: MealPlanEntry[]
    aim: ReturnType<typeof slotBudget>
    goals: MacroGoals | null
    busy: boolean
    onBack: () => void
    onPlan: (dates: string[], sides: string[]) => void
    onLog: (plate: PlateLineInput[]) => void
}) {
    const [sides, setSides] = useState<string[]>([])
    const [days, setDays] = useState<string[]>([date])
    const [grams, setGrams] = useState<Record<string, string>>({})
    const food = foods.find((f) => f._id === main)
    const today = todayKey()

    const sideOptions = foods
        .filter((f) => f._id !== main && (!eaten || plateable(f)))
        .sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === 'plain' ? -1 : 1))
    const ids = [main, ...sides]
    const byId = new Map(foods.map((f) => [f._id, f]))

    // Planned: the estimate the day will show for it.
    const estimate = useMemo(() => {
        if (eaten) return null
        const note = {
            _id: '__new',
            slot,
            macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
            box: main,
            sides,
        }
        const per100For = (id: string) => {
            const f = byId.get(id)
            return (f && expectedPer100(f)?.per100) ?? null
        }
        return (
            projectBoxNotes(
                [...entries.filter((e) => e.slot !== slot || !e.box), note],
                goals,
                per100For
            ).get('__new') ?? null
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eaten, slot, main, sides, entries, goals, foods])

    // Eaten: each line's figures, and the grams the aim suggests.
    const lines = ids.flatMap((id) => {
        const f = byId.get(id)
        if (!f) return []
        const cook = f.open[0] ?? null
        const per100 = f.kind === 'box' ? cook?.per100 : f.per100
        if (!per100) return []
        const left = f.open.length
            ? f.open.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)
            : null
        return [{ id, f, cook, per100, left }]
    })
    const typed = (id: string) => {
        const g = Number(grams[id] ?? '')
        return Number.isFinite(g) && g > 0 ? g : null
    }
    const suggested =
        eaten && aim
            ? suggestGrams(
                  lines.map((l) => ({ per100: l.per100, fixed: typed(l.id), max: l.left })),
                  aim.budget,
                  aim.keys,
                  aim.size
              )
            : null
    // A blank line counts at its suggested grams — so the suggestion logs in one tap.
    const plate = lines.map((l, i) => ({ ...l, grams: typed(l.id) ?? suggested?.[i] ?? 0 }))
    const total = plateTotal(plate.map((l) => ({ grams: l.grams, per100: l.per100 })))

    if (!food) return <BackButton onClick={onBack} />

    const toggleSide = (id: string) =>
        setSides((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-4)
        )
    const toggleDay = (d: string) =>
        setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))

    return (
        <div className="flex flex-col gap-5">
            <BackButton onClick={onBack} />
            <div>
                <p className="text-lg font-semibold tracking-tight text-neutral-900">{food.name}</p>
                <p className="text-xs text-neutral-500">{stockLine(food)}</p>
            </div>

            {sideOptions.length > 0 && (
                <section className="flex flex-col gap-2">
                    <p className={LABEL}>With a side? · optional</p>
                    <div className="flex flex-wrap gap-1.5">
                        {sideOptions.map((f) => {
                            const on = sides.includes(f._id)
                            return (
                                <button
                                    key={f._id}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleSide(f._id)}
                                    className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
                                        on
                                            ? 'bg-neutral-900 text-white'
                                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                    }`}
                                >
                                    {on && (
                                        <i
                                            className="fa-solid fa-check text-[10px]"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {f.name}
                                </button>
                            )
                        })}
                    </div>
                </section>
            )}

            {eaten ? (
                <>
                    <section className="flex flex-col gap-2">
                        <p className={LABEL}>How much</p>
                        {suggested && (
                            <p className="-mt-1 text-xs text-neutral-500">
                                Filled in with what fits the aim — weigh it and change any that
                                differ.
                            </p>
                        )}
                        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                            {plate.map((l) => {
                                const m = lineMacros(l.grams, l.per100)
                                const over = l.left != null && l.grams > l.left
                                return (
                                    <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-neutral-900">
                                                {l.f.name}
                                            </p>
                                            <p
                                                className={`truncate text-xs tabular-nums ${over ? 'text-amber-700' : 'text-neutral-500'}`}
                                            >
                                                {over
                                                    ? `Only ~${fmt(l.left!)} g left`
                                                    : `${kcal(m.calories)} kcal · ${fmt(Math.round(m.protein))} g protein`}
                                            </p>
                                        </div>
                                        <label className="relative shrink-0">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                step="any"
                                                enterKeyHint="done"
                                                aria-label={`${l.f.name} grams`}
                                                placeholder={suggested ? String(l.grams) : '0'}
                                                value={grams[l.id] ?? ''}
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
                                                className="h-11 w-24 rounded-xl bg-white pl-3 pr-7 text-right text-sm font-semibold tabular-nums text-neutral-900 outline-none ring-1 ring-inset ring-neutral-200 placeholder:font-normal placeholder:text-neutral-400 focus:ring-2 focus:ring-neutral-900"
                                            />
                                            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-neutral-500">
                                                g
                                            </span>
                                        </label>
                                    </li>
                                )
                            })}
                        </ul>
                        <p className="text-[13px] tabular-nums text-neutral-600">
                            <span className="font-semibold text-neutral-900">
                                {kcal(total.calories)} kcal
                            </span>{' '}
                            · {fmt(Math.round(total.protein))} g protein ·{' '}
                            {fmt(Math.round(total.carbs))} g carbs · {fmt(Math.round(total.fat))} g
                            fat
                        </p>
                    </section>
                    <Button
                        icon="fa-solid fa-check"
                        disabled={busy || plate.every((l) => l.grams === 0)}
                        onClick={() =>
                            onLog(
                                plate
                                    .filter((l) => l.grams > 0)
                                    .map((l) => ({
                                        food: l.id,
                                        grams: l.grams,
                                        ...(l.cook ? { batch: l.cook._id } : {}),
                                    }))
                            )
                        }
                        className="w-full justify-center"
                    >
                        Log it
                    </Button>
                </>
            ) : (
                <>
                    <section className="flex flex-col gap-2">
                        <p className={LABEL}>Estimated portion</p>
                        {estimate ? (
                            <div className="rounded-2xl bg-neutral-50 px-3 py-2.5">
                                <p className="text-sm tabular-nums text-neutral-800">
                                    {estimate.lines
                                        .map(
                                            (l) =>
                                                `~${fmt(l.grams)} g ${byId.get(l.food)?.name ?? ''}`
                                        )
                                        .join(' + ')}
                                </p>
                                <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
                                    ~{kcal(estimate.macros.calories)} kcal ·{' '}
                                    {fmt(Math.round(estimate.macros.protein))} g protein ·{' '}
                                    {fmt(Math.round(estimate.macros.carbs))} g carbs ·{' '}
                                    {fmt(Math.round(estimate.macros.fat))} g fat
                                </p>
                            </div>
                        ) : (
                            <p className="text-xs text-neutral-500">
                                No estimate — the day has no targets, or there are no figures for it
                                yet.
                            </p>
                        )}
                        <p className="text-xs text-neutral-500">
                            No amounts are saved — you’ll confirm the grams when you eat it.
                        </p>
                    </section>

                    <section className="flex flex-col gap-2">
                        <p className={LABEL}>Which days · {CATEGORY[slot].label}</p>
                        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                            {Array.from({ length: 7 }, (_, i) => addDays(date, i)).map((d) => {
                                const on = days.includes(d)
                                const { year, month, day } = parseDateKey(d)
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        aria-pressed={on}
                                        disabled={d < today}
                                        onClick={() => toggleDay(d)}
                                        className={`flex h-14 flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                                            on
                                                ? 'bg-neutral-900 text-white'
                                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                        }`}
                                    >
                                        <span>
                                            {WEEKDAYS_LONG[
                                                new Date(year, month, day).getDay()
                                            ].slice(0, 3)}
                                        </span>
                                        <span
                                            className={`text-xs font-medium ${on ? 'text-white/70' : 'text-neutral-500'}`}
                                        >
                                            {day}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </section>
                    <Button
                        icon="fa-solid fa-calendar-plus"
                        disabled={busy || days.length === 0}
                        onClick={() => onPlan(days, sides)}
                        className="w-full justify-center"
                    >
                        {days.length <= 1 ? 'Plan it' : `Plan for ${days.length} days`}
                    </Button>
                </>
            )}
        </div>
    )
}

// ─── Away ──────────────────────────────────────────────────────────────────────

/** The part of the day a slot falls in, for matching it against calendar events. */
const SLOT_PART: Record<MealType, 'morning' | 'afternoon' | 'evening' | null> = {
    breakfast: 'morning',
    lunch: 'afternoon',
    dinner: 'evening',
    snack: null,
}

/**
 * "At an event, so no meal here": pick one of the day's calendar events — the
 * ones over this slot come first — or type a reason. The slot gets a note
 * with no numbers, replacing whatever was still planned there.
 */
function AwayStep({
    date,
    slot,
    events,
    planned,
    busy,
    onBack,
    onPick,
}: {
    date: string
    /** Null: the whole day. */
    slot: MealType | null
    events: Event[]
    /** Meals still planned in the slot (or the day), which the notes replace. */
    planned: number
    busy: boolean
    onBack?: () => void
    onPick: (name: string) => void
}) {
    const [other, setOther] = useState('')
    const part = slot ? SLOT_PART[slot] : null
    const covers = (e: Event) =>
        eventCoversAllDay(e, date) || (part ? eventCoversSlot(e, date, part) : true)
    const sorted = [...events].sort(
        (a, b) =>
            Number(covers(b)) - Number(covers(a)) || (a.time ?? '').localeCompare(b.time ?? '')
    )
    const slotName = slot ? CATEGORY[slot].label.toLowerCase() : 'meals'
    const when = (e: Event) => {
        if (e.allDay || e.startPart === 'na' || date !== e.startDate)
            return e.time && date === e.startDate ? e.time : 'All day'
        return e.time ?? e.startPart[0].toUpperCase() + e.startPart.slice(1)
    }

    return (
        <div className="flex flex-col gap-4">
            {onBack && <BackButton onClick={onBack} />}
            <p className="text-sm text-neutral-500">
                {slot
                    ? `Not eating ${slotName} here? It won’t count towards the day, and the rest of the day’s aim is shared over the other meals.`
                    : 'Away for the whole day? Every meal is marked away and the day drops out of the numbers. Single meals can still be marked away on their own.'}
                {planned > 0 &&
                    ` The ${planned} meal${planned === 1 ? '' : 's'} planned ${slot ? `for ${slotName}` : 'that day'} will be removed.`}
            </p>
            {sorted.length > 0 && (
                <section className="flex flex-col gap-2">
                    <p className={LABEL}>On the calendar</p>
                    <ul className="flex flex-col gap-1.5">
                        {sorted.map((e) => (
                            <Row
                                key={`${e._id}|${e.startDate}`}
                                title={e.title}
                                detail={`${when(e)}${e.location ? ` · ${e.location}` : ''}${
                                    covers(e) && part ? ` · over ${slotName}` : ''
                                }`}
                                icon="fa-regular fa-calendar"
                                disabled={busy}
                                onClick={() => onPick(e.title)}
                            />
                        ))}
                    </ul>
                </section>
            )}
            <form
                className="flex flex-col gap-2"
                onSubmit={(ev) => {
                    ev.preventDefault()
                    onPick(other)
                }}
            >
                <p className={LABEL}>{sorted.length > 0 ? 'Something else' : 'Where are you?'}</p>
                <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                        <Input
                            placeholder="e.g. Eating out"
                            value={other}
                            onChange={(e) => setOther(e.target.value)}
                        />
                    </div>
                    <Button type="submit" variant="secondary" disabled={busy}>
                        Mark away
                    </Button>
                </div>
            </form>
        </div>
    )
}
