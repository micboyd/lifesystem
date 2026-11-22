import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Input from '../Input'
import ConfirmModal from '../ConfirmModal'
import DatePicker, { type DatePickerValue, type DateRange } from '../DatePicker'
import PillToggle from '../PillToggle'
import { Bar, BarButton, CAPS, DoneTick, Eyebrow } from '../Blok'
import { CategoryIcon } from './mealUi'
import Portioning from './Portioning'
import { useSideMarks } from './useSideMarks'
import { plural } from './ShoppingList'
import { CountStepper, ICON_BTN, MealPicker, StepHead, StepRail } from './PrepParts'
import EmptyState from '../EmptyState'
import { addShoppingItem, clearShopping, deleteShoppingGroup, setPrep, tickShopping } from '../../services/shopping'
import { listPlanEntries } from '../../services/mealPlan'
import { lineAmount, mergeLines, tickedKeys, traysFor } from '../../lib/shopping'
import { dayShort, daysLabel, isBatch, prepFor, prepMeals, prepPresets, type PrepRow } from '../../lib/prep'
import { addDays, todayKey } from '../../lib/calendar'
import { useToast } from '../../context/ToastContext'
import type { Meal, MealPlanEntry, PrepRange, ShoppingList } from '../../types'

/**
 * Prep, full screen: plan → shop → cook, read off the planner. Pick the days
 * you're cooking for; every meal still to eat in them is counted and split into
 * Batch cook (cooked ahead, portioned into boxes) and Fresh on the day. Shop is
 * one merged list for all of it; Cook weighs each batch pot and says what goes
 * in every box. Nothing is tracked after the cook — you eat off the planner.
 */

type Step = 'days' | 'shop' | 'cook'
const ORDER: Step[] = ['days', 'shop', 'cook']
const STEP_KEY = 'nutrition.prepStep'

function readStep(): Step {
    try {
        const v = localStorage.getItem(STEP_KEY)
        return v === 'shop' || v === 'cook' ? v : 'days'
    } catch {
        return 'days'
    }
}

/** Where Prep starts: the days asked for, else the last ones (if not over), else the rest of this week. */
export function startRange(list: ShoppingList, today: string, asked: { from?: string | null; to?: string | null }): PrepRange {
    // Before Prep had days, nothing was added by hand that it knows of — see `leftovers`.
    const extras = list.prep?.extras ?? []
    if (asked.from && asked.to && asked.from <= asked.to) return { from: asked.from, to: asked.to, extras }
    if (list.prep && list.prep.to >= today) return { ...list.prep, from: list.prep.from < today ? today : list.prep.from }
    const [, rest, next] = prepPresets(today)
    // Only a day or two left of the week: plan the next one too.
    const to = rest.to >= addDays(today, 2) ? rest.to : next.to
    return { from: today, to, extras }
}

/**
 * A list from before Prep had days: whatever it holds beyond what the days
 * plan (added from the Library, say) stays on, as meals added by hand.
 */
export function leftovers(list: ShoppingList, planned: Map<string, number>): PrepRange['extras'] {
    return list.groups
        .filter((g) => g.kind === 'meal' && g.ref)
        .map((g) => ({ meal: g.ref!, count: g.count - (planned.get(g.ref!) ?? 0) }))
        .filter((x) => x.count > 0)
}

/** One meal in the days: what, when, how many. Meals added by hand get a stepper. */
function PrepMealRow({ row, onExtra }: { row: PrepRow; onExtra: (n: number) => void }) {
    const { meal } = row
    const tray = (meal.batchOf ?? 0) > 1 ? meal.batchOf! : null
    const total = row.planned + row.extra
    const unit = row.batch ? (total === 1 ? 'box' : 'boxes') : '×'
    const when = [
        row.dates.length > 0 && daysLabel(row.dates),
        row.extra > 0 && (row.planned > 0 ? `+${row.extra} added` : 'Added by hand'),
        tray && `${plural(traysFor(total, tray), 'tray')} of ${tray}`,
        meal.ingredients.length === 0 && 'no ingredients — bought as itself',
    ]
        .filter(Boolean)
        .join(' · ')
    return (
        <li className="flex min-h-[68px] items-center gap-3 border-b border-hairline py-3">
            {meal.types[0] ? <CategoryIcon type={meal.types[0]} /> : <span className="h-9 w-9 shrink-0 bg-neutral-100" />}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-neutral-900">{meal.name}</span>
                <span className="block truncate text-[13px] text-neutral-600">{when}</span>
            </span>
            {row.extra > 0 && row.planned === 0 ? (
                <CountStepper
                    name={meal.name}
                    value={tray ? Math.max(1, Math.round(row.extra / tray)) : row.extra}
                    max={tray ? Math.floor(99 / tray) : 99}
                    onChange={(n) => onExtra(tray ? n * tray : n)}
                    onRemove={() => onExtra(0)}
                />
            ) : (
                <span className="shrink-0 text-right">
                    <span className="block text-[17px] tabular-nums text-neutral-900">
                        {unit === '×' ? `×${total}` : total}
                    </span>
                    {unit !== '×' && <span className={`${CAPS} block text-neutral-500`}>{unit}</span>}
                </span>
            )}
        </li>
    )
}

export default function Prep({
    meals,
    list,
    onChange,
    asked,
}: {
    meals: Meal[]
    list: ShoppingList
    onChange: (list: ShoppingList) => void
    /** Days handed over in the URL (the planner's "Prep these days"). */
    asked: { from: string | null; to: string | null }
}) {
    const toast = useToast()
    const navigate = useNavigate()
    const today = todayKey()
    const sides = useSideMarks()
    const [range, setRange] = useState<PrepRange>(() => startRange(list, today, asked))
    const [step, setStepState] = useState<Step>(() => (asked.from ? 'days' : readStep()))
    const [entries, setEntries] = useState<MealPlanEntry[] | null>(null)
    const [picking, setPicking] = useState(false)
    const [text, setText] = useState('')
    const [confirmClear, setConfirmClear] = useState(false)
    const [saving, setSaving] = useState(false)

    // A list from before Prep had days: work out its extras once the first days are read.
    const [legacy, setLegacy] = useState(() => !list.prep && list.groups.some((g) => g.kind === 'meal'))
    useEffect(() => {
        let live = true
        listPlanEntries(range.from, range.to)
            .then((rows) => {
                if (!live) return
                setEntries(rows)
                if (legacy) {
                    setLegacy(false)
                    const counted = prepFor(rows, new Map(meals.map((m) => [m._id, m])), { ...range, extras: [] }, today)
                    const planned = new Map([...counted.batch, ...counted.fresh].map((r) => [r.meal._id, r.planned]))
                    setRange((r) => ({ ...r, extras: leftovers(list, planned) }))
                }
            })
            .catch(() => live && setEntries([]))
        return () => {
            live = false
        }
        // Read again only when the days change; the rest is read as it stands then.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range.from, range.to])

    const byId = useMemo(() => new Map(meals.map((m) => [m._id, m])), [meals])
    const prep = useMemo(() => prepFor(entries ?? [], byId, range, today), [entries, byId, range, today])
    const boxes = prep.batch.reduce((n, r) => n + r.planned + r.extra, 0)
    const freshCount = prep.fresh.reduce((n, r) => n + r.planned + r.extra, 0)

    // The list as Prep wants it, against the list as it is.
    const wanted = prepMeals(prep)
    const inSync =
        !!list.prep &&
        list.prep.from === range.from &&
        list.prep.to === range.to &&
        JSON.stringify(list.prep.extras) === JSON.stringify(range.extras) &&
        JSON.stringify(
            list.groups
                .filter((g) => g.kind === 'meal')
                .map((g) => ({ id: g.ref, count: g.count }))
                .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        ) === JSON.stringify([...wanted].sort((a, b) => a.id.localeCompare(b.id)))

    async function sync(): Promise<boolean> {
        if (entries === null) return false
        if (inSync) return true
        setSaving(true)
        try {
            onChange(await setPrep(range, wanted))
            return true
        } catch {
            toast.show('Could not update the shopping list.', 'danger')
            return false
        } finally {
            setSaving(false)
        }
    }

    async function setStep(s: Step) {
        if (step === 'days' && s !== 'days' && !(await sync())) return
        setStepState(s)
        try {
            localStorage.setItem(STEP_KEY, s)
        } catch {
            /* not remembered */
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    const leave = () => navigate('/nutrition')

    function run(fn: () => Promise<ShoppingList>) {
        fn()
            .then(onChange)
            .catch(() => toast.show('Could not update the shopping list.', 'danger'))
    }

    function setExtra(mealId: string, count: number) {
        setRange((r) => ({
            ...r,
            extras: [...r.extras.filter((x) => x.meal !== mealId), ...(count > 0 ? [{ meal: mealId, count }] : [])],
        }))
    }
    function pick(meal: Meal) {
        setPicking(false)
        const step = (meal.batchOf ?? 0) > 1 ? meal.batchOf! : 1
        const had = range.extras.find((x) => x.meal === meal._id)?.count ?? 0
        setExtra(meal._id, Math.min(99, had + step))
    }
    const presets = prepPresets(today)
    const preset = presets.find((p) => p.from === range.from && p.to === range.to)
    function setDays(from: string, to: string) {
        if (!from || !to || (from === range.from && to === range.to)) return
        setEntries(null)
        setRange((r) => ({ ...r, from, to: to < from ? from : to }))
    }

    // Shop.
    const batchNames = new Set(prep.batch.map((r) => r.meal.name))
    const ticked = tickedKeys(list.ticked)
    const lines = mergeLines(list.groups)
    const toGet = lines.filter((l) => !ticked.has(l.key))
    const inBasket = lines.filter((l) => ticked.has(l.key))

    // Cook: the batch meals on the list.
    const cooking = list.groups.filter((g) => {
        const m = g.kind === 'meal' && g.ref ? byId.get(g.ref) : undefined
        return !!m && isBatch(m)
    })

    const rangeLabel = range.from === range.to ? dayShort(range.from) : `${dayShort(range.from)} – ${dayShort(range.to)}`
    const steps = [
        {
            key: 'days' as const,
            label: 'Days',
            status: rangeLabel,
            done: inSync && wanted.length > 0,
        },
        {
            key: 'shop' as const,
            label: 'Shop',
            status: lines.length === 0 ? 'Nothing yet' : toGet.length ? `${toGet.length} to buy` : 'All bought',
            done: lines.length > 0 && toGet.length === 0,
        },
        {
            key: 'cook' as const,
            label: 'Cook',
            status: cooking.length ? plural(cooking.length, 'pot') : 'Nothing to batch',
            done: false,
        },
    ]
    const at = ORDER.indexOf(step)
    const prev = at > 0 ? ORDER[at - 1] : null
    const next = at < ORDER.length - 1 ? ORDER[at + 1] : null
    const nextLabel = step === 'days' ? (saving ? 'Saving…' : 'Shop') : step === 'shop' ? 'Cook' : 'Done'
    const footNote =
        step === 'days'
            ? entries === null
                ? 'Reading the planner…'
                : [boxes && plural(boxes, 'box', 'boxes') + ' to cook', freshCount && `${freshCount} fresh`]
                      .filter(Boolean)
                      .join(' · ') || 'Nothing planned in these days'
            : step === 'shop'
              ? lines.length
                  ? `${inBasket.length} of ${lines.length} bought`
                  : 'Nothing to buy yet'
              : cooking.length
                ? `${plural(cooking.length, 'pot')} to portion`
                : 'Nothing to batch cook'

    const skipped = [
        prep.left.past > 0 && `${plural(prep.left.past, 'meal')} on days gone`,
        prep.left.done > 0 && `${plural(prep.left.done, 'meal')} already eaten or skipped`,
        prep.left.noMeal > 0 && `${plural(prep.left.noMeal, 'quick add')} not in your library`,
    ].filter(Boolean) as string[]

    const line = (l: (typeof lines)[number]) => {
        const done = ticked.has(l.key)
        const item = l.item
        const side = sides.isSide(l.name)
        const fromBatch = l.from.some((n) => batchNames.has(n))
        return (
            <li key={l.key} className="flex min-h-14 items-center gap-1 border-b border-hairline">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => run(() => tickShopping(l.name, !done))}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 text-left"
                >
                    {done ? <DoneTick size={18} label="Bought" /> : <span className="h-[18px] w-[18px] shrink-0 border border-neutral-400" />}
                    <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[15px] ${done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                            {l.name}
                        </span>
                        {l.from.length > 0 && <span className="block truncate text-[12px] text-neutral-500">{l.from.join(', ')}</span>}
                    </span>
                    {lineAmount(l) && (
                        <span className={`shrink-0 text-[15px] tabular-nums ${done ? 'text-neutral-400' : 'text-neutral-800'}`}>
                            {lineAmount(l)}
                        </span>
                    )}
                </button>
                {fromBatch && (
                    <button
                        type="button"
                        aria-pressed={side}
                        aria-label={`${l.name} is a side`}
                        title="A side is cooked in its own pot and weighed out on its own"
                        onClick={() => sides.setSide(l.name, !side)}
                        className="grid h-11 shrink-0 place-items-center px-1"
                    >
                        <span
                            className={`px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                                side
                                    ? 'bg-neutral-900 text-white'
                                    : 'border border-neutral-200 text-neutral-400 hover:border-neutral-400 hover:text-neutral-700'
                            }`}
                        >
                            Side
                        </span>
                    </button>
                )}
                {item && (
                    <button type="button" aria-label={`Remove ${l.name}`} onClick={() => run(() => deleteShoppingGroup(item.id))} className={ICON_BTN}>
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                )}
            </li>
        )
    }

    const group = (title: string, note: string, rows: PrepRow[]) =>
        rows.length > 0 && (
            <div>
                <div className="flex items-baseline justify-between gap-4 pb-3">
                    <Eyebrow>{title}</Eyebrow>
                    <span className="text-[13px] text-neutral-500">{note}</span>
                </div>
                <ul className="border-t border-neutral-900">
                    {rows.map((r) => (
                        <PrepMealRow key={r.meal._id} row={r} onExtra={(n) => setExtra(r.meal._id, n)} />
                    ))}
                </ul>
            </div>
        )

    return (
        <div className="flex min-h-dvh flex-col bg-canvas">
            <div className="sticky top-0 z-20 bg-canvas pt-[env(safe-area-inset-top)]">
                <div className="flex min-h-16 items-center gap-3 border-b border-hairline px-3 sm:px-8">
                    <button type="button" onClick={leave} aria-label="Back to Nutrition" className={ICON_BTN}>
                        <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className={`${CAPS} hidden text-neutral-500 sm:block`}>Nutrition</p>
                        <h1 className="truncate text-[17px] font-medium">Prep</h1>
                    </div>
                    {list.groups.length > 0 && (
                        <BarButton onClick={() => setConfirmClear(true)} className="!border-neutral-300">
                            Start over
                        </BarButton>
                    )}
                </div>
                <div className="mx-auto max-w-5xl sm:px-8">
                    <StepRail step={step} onStep={(s) => void setStep(s)} steps={steps} />
                </div>
            </div>

            <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-36 pt-10 sm:px-8 sm:pt-14">
                {step === 'days' && (
                    <section className="flex flex-col gap-10">
                        <StepHead n={1} title="Which days are you cooking for?">
                            Prep reads them off your planner. Batch meals are cooked ahead and boxed up; the rest you make
                            on the day — it all goes on one shopping list.
                        </StepHead>

                        <div className="flex flex-col gap-3">
                            <DatePicker
                                mode="range"
                                value={{ start: range.from, end: range.to }}
                                minDate={today}
                                clearable={false}
                                onChange={(v: DatePickerValue) => {
                                    if (v && typeof v === 'object' && 'start' in v) {
                                        const r = v as DateRange
                                        // Mid-pick the end comes back empty; hold the old days until it's set.
                                        if (r.start && r.end) setDays(r.start, r.end)
                                    }
                                }}
                                className="w-full sm:w-80"
                            />
                            <PillToggle
                                label="Quick picks for the days"
                                options={[...presets.map((p) => ({ value: p.label, label: p.label })), ...(preset ? [] : [{ value: 'custom', label: 'Custom' }])]}
                                value={preset?.label ?? 'custom'}
                                onChange={(label) => {
                                    const p = presets.find((x) => x.label === label)
                                    if (p) setDays(p.from, p.to)
                                }}
                            />
                        </div>

                        {entries === null ? (
                            <p className="border-y border-hairline py-12 text-[14px] text-neutral-500">Reading the planner…</p>
                        ) : prep.batch.length + prep.fresh.length === 0 ? (
                            <EmptyState
                                icon="fa-solid fa-calendar-week"
                                title="Nothing planned in these days"
                                action={
                                    <div className="flex flex-wrap gap-2">
                                        <BarButton solid onClick={leave}>
                                            Open the planner
                                        </BarButton>
                                        <BarButton onClick={() => setPicking(true)}>Add a meal by hand</BarButton>
                                    </div>
                                }
                                description="Put meals on the planner (or apply a plan), then come back. Or add a meal by hand."
                                className="border-y border-hairline"
                            />
                        ) : (
                            <div className="flex flex-col gap-10">
                                {group('Batch cook', boxes ? plural(boxes, 'box', 'boxes') : '', prep.batch)}
                                {group('Fresh on the day', freshCount ? `${freshCount} in all` : '', prep.fresh)}
                                <div className="flex flex-col gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPicking(true)}
                                        className="flex min-h-14 w-full items-center gap-3 border-y border-hairline text-left text-[15px] text-neutral-600 transition-colors hover:text-neutral-900"
                                    >
                                        <span className="grid h-9 w-9 shrink-0 place-items-center border border-dashed border-neutral-400">
                                            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                                        </span>
                                        Add a meal by hand
                                    </button>
                                    {prep.batch.length === 0 && (
                                        <p className="text-[13px] text-neutral-500">
                                            Nothing here is set to Batch cook. Switch it on for a meal in the Library and it’s
                                            boxed up in Cook.
                                        </p>
                                    )}
                                    {skipped.length > 0 && <p className="text-[13px] text-neutral-500">Left out: {skipped.join(', ')}.</p>}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {step === 'shop' && (
                    <section className="flex flex-col gap-8">
                        <StepHead
                            n={2}
                            title="Shopping list"
                            aside={
                                inBasket.length > 0 && (
                                    <BarButton onClick={() => run(() => clearShopping(true))} className="!border-neutral-300">
                                        Clear bought
                                    </BarButton>
                                )
                            }
                        >
                            Everything for {rangeLabel}, one line each. Tap <span className="text-neutral-900">Side</span> on
                            anything cooked in its own pot (rice, pasta) — you’ll weigh it on its own in Cook.
                        </StepHead>

                        {lines.length > 0 && (
                            <div className="flex items-center gap-4">
                                <Bar pct={(inBasket.length / lines.length) * 100} color="#111111" className="flex-1" />
                                <span className="shrink-0 text-[13px] text-neutral-600">
                                    <span className="tabular-nums text-neutral-900">{inBasket.length}</span> of{' '}
                                    <span className="tabular-nums">{lines.length}</span> bought
                                </span>
                            </div>
                        )}

                        <div>
                            <form
                                className="flex items-center gap-2 border-t border-neutral-900 py-3"
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    const name = text.trim()
                                    if (!name) return
                                    setText('')
                                    run(() => addShoppingItem(name))
                                }}
                            >
                                <div className="min-w-0 flex-1">
                                    <Input
                                        aria-label="Add something else"
                                        placeholder="Add something else… (milk, foil)"
                                        enterKeyHint="done"
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                    />
                                </div>
                                <BarButton type="submit" solid disabled={!text.trim()}>
                                    Add
                                </BarButton>
                            </form>
                            {lines.length === 0 ? (
                                <p className="border-t border-hairline py-12 text-[14px] text-neutral-500">
                                    Pick the days in step 1 and everything they need lands here, one line each.
                                </p>
                            ) : (
                                <>
                                    {toGet.length > 0 ? (
                                        <ul className="border-t border-hairline">{toGet.map(line)}</ul>
                                    ) : (
                                        <p className="flex items-center gap-2.5 border-y border-hairline py-6 text-[15px] text-neutral-700">
                                            <DoneTick size={16} />
                                            Everything’s in the basket.
                                        </p>
                                    )}
                                    {inBasket.length > 0 && (
                                        <div className="mt-8">
                                            <Eyebrow className="pb-3">In the basket · {inBasket.length}</Eyebrow>
                                            <ul className="border-t border-hairline">{inBasket.map(line)}</ul>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </section>
                )}

                {step === 'cook' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={3} title="Cook and box up">
                            Weigh each pot after cooking — zero the scale with the empty pot first. You’ll see how much of
                            each goes in every box, and what one box gives you.
                        </StepHead>
                        {cooking.length > 0 ? (
                            <Portioning cooking={cooking} byId={byId} sides={sides} />
                        ) : (
                            <EmptyState
                                icon="fa-solid fa-scale-balanced"
                                title="Nothing to batch cook"
                                action={<BarButton onClick={() => void setStep('days')}>Back to the days</BarButton>}
                                description="None of the meals in these days are set to Batch cook — everything’s made fresh on the day."
                                className="border-y border-hairline"
                            />
                        )}
                    </section>
                )}
            </main>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto flex min-h-[72px] max-w-5xl items-center gap-3 px-5 sm:px-8">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">{footNote}</p>
                    {prev && (
                        <BarButton onClick={() => void setStep(prev)} className="!border-neutral-300">
                            Back
                        </BarButton>
                    )}
                    {next ? (
                        <BarButton solid arrow disabled={saving || entries === null} onClick={() => void setStep(next)}>
                            {nextLabel}
                        </BarButton>
                    ) : (
                        <BarButton solid onClick={leave}>
                            {nextLabel}
                        </BarButton>
                    )}
                </div>
            </div>

            <MealPicker
                open={picking}
                onClose={() => setPicking(false)}
                meals={meals}
                onPick={pick}
                onList={new Set(range.extras.map((x) => x.meal))}
            />
            <ConfirmModal
                open={confirmClear}
                onClose={() => setConfirmClear(false)}
                title="Start over?"
                message="Clears the shopping list and the meals added by hand. Your planner and Library stay as they are."
                confirmLabel="Start over"
                danger
                onConfirm={() => {
                    setRange((r) => ({ ...r, extras: [] }))
                    run(() => clearShopping(false))
                }}
            />
        </div>
    )
}
