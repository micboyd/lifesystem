import { useMemo, useState, type ReactNode } from 'react'
import BottomSheet from '../BottomSheet'
import Button from '../Button'
import Input from '../Input'
import EmptyState from '../EmptyState'
import ConfirmModal from '../ConfirmModal'
import { CategoryIcon } from './mealUi'
import Portioning from './Portioning'
import { useSideMarks } from './useSideMarks'
import { countLabel, plural } from './ShoppingList'
import {
    addShoppingItem,
    addToShopping,
    clearShopping,
    deleteShoppingGroup,
    setShoppingCount,
    tickShopping,
} from '../../services/shopping'
import {
    lineAmount,
    mergeLines,
    tickedKeys,
    timesBought,
    trayOf,
    traysFor,
} from '../../lib/shopping'
import { useToast } from '../../context/ToastContext'
import type { Meal, ShoppingGroup, ShoppingList } from '../../types'

/**
 * Thinking ahead: plan a cook. Add the meals you're going to make and how
 * many of each ("7 portions", "2 trays"); underneath is one shopping list
 * with every ingredient merged into a single line. Nothing is tracked after
 * the shop — clear it and plan the next one.
 */

const OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'
const CARD = 'overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-900/[0.06]'
const MAX = 99

function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
    return (
        <div className="flex min-h-9 items-center justify-between gap-3">
            <h2 className={OVERLINE}>{title}</h2>
            {aside}
        </div>
    )
}

/** − n + with the number typeable. At one, the minus takes it off. */
function CountStepper({
    name,
    value,
    max,
    onChange,
    onRemove,
}: {
    name: string
    value: number
    max: number
    onChange: (n: number) => void
    onRemove: () => void
}) {
    // What's typed while the number has focus; the real count otherwise.
    const [draft, setDraft] = useState<string | null>(null)
    const commit = () => {
        const n = Math.round(Number(draft))
        setDraft(null)
        if (draft && Number.isFinite(n) && n >= 1 && Math.min(n, max) !== value)
            onChange(Math.min(n, max))
    }
    const btn =
        'grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-white hover:text-neutral-900 disabled:opacity-40'
    return (
        <div className="flex shrink-0 items-center rounded-full bg-neutral-100 p-0.5">
            {value > 1 ? (
                <button
                    type="button"
                    aria-label={`One fewer ${name}`}
                    onClick={() => onChange(value - 1)}
                    className={btn}
                >
                    <i className="fa-solid fa-minus text-[11px]" aria-hidden="true" />
                </button>
            ) : (
                <button
                    type="button"
                    aria-label={`Take ${name} off`}
                    onClick={onRemove}
                    className={btn}
                >
                    <i className="fa-solid fa-trash-can text-[11px]" aria-hidden="true" />
                </button>
            )}
            <input
                aria-label={`How many ${name}`}
                inputMode="numeric"
                value={draft ?? String(value)}
                onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                }}
                onFocus={(e) => {
                    setDraft(String(value))
                    e.currentTarget.select()
                }}
                className="h-9 w-8 bg-transparent text-center text-sm font-semibold tabular-nums text-neutral-900 outline-none"
            />
            <button
                type="button"
                aria-label={`One more ${name}`}
                disabled={value >= max}
                onClick={() => onChange(value + 1)}
                className={btn}
            >
                <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
            </button>
        </div>
    )
}

/** One meal being cooked: name, how many, and (opened) its own share of the shop. */
function CookRow({
    group,
    meal,
    run,
}: {
    group: ShoppingGroup
    meal?: Meal
    run: (fn: () => Promise<ShoppingList>) => void
}) {
    const [open, setOpen] = useState(false)
    const tray = trayOf(group)
    // A tray steps a whole tray at a time; the server keeps the count in boxes.
    const shown = tray ? traysFor(group.count, tray) : group.count
    const max = tray ? Math.floor(MAX / tray) : MAX
    const setTo = (n: number) => run(() => setShoppingCount(group.id, tray ? n * tray : n))
    const times = timesBought(group)
    const hasIngredients = group.ingredients.length > 0

    return (
        <li>
            <div className="flex min-h-16 items-center gap-3 py-2.5 pl-3 pr-2">
                <button
                    type="button"
                    aria-expanded={open}
                    disabled={!hasIngredients}
                    onClick={() => setOpen((o) => !o)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                    {meal?.types[0] ? (
                        <CategoryIcon type={meal.types[0]} />
                    ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-sm text-neutral-500">
                            <i className="fa-solid fa-utensils" aria-hidden="true" />
                        </span>
                    )}
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-neutral-900">
                            {group.name}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                            {countLabel(group)}
                            {meal && (
                                <>
                                    {' · '}
                                    <span className="tabular-nums">
                                        {Math.round(meal.macros.calories)}
                                    </span>{' '}
                                    kcal each
                                </>
                            )}
                            {!hasIngredients && (
                                <span className="text-amber-700"> · no ingredients yet</span>
                            )}
                        </span>
                    </span>
                    {hasIngredients && (
                        <i
                            className={`fa-solid fa-chevron-down text-[11px] text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                        />
                    )}
                </button>
                <CountStepper
                    name={tray ? `trays of ${group.name}` : group.name}
                    value={shown}
                    max={max}
                    onChange={setTo}
                    onRemove={() => run(() => deleteShoppingGroup(group.id))}
                />
            </div>
            {open && hasIngredients && (
                <ul className="mx-3 mb-3 divide-y divide-neutral-100 rounded-xl bg-neutral-50 px-3">
                    {mergeLines([group]).map((l) => (
                        <li
                            key={l.key}
                            className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                            <span className="truncate text-neutral-700">{l.name}</span>
                            <span className="shrink-0 tabular-nums text-neutral-500">
                                {lineAmount(l) || '×1'}
                            </span>
                        </li>
                    ))}
                    <li className="py-2 text-xs text-neutral-500">
                        {tray
                            ? `Each tray makes ${plural(tray, 'box', 'boxes')}.`
                            : `${plural(times, 'portion')}’ worth.`}
                    </li>
                </ul>
            )}
        </li>
    )
}

/** The meal picker: search the library, tap one to add it. */
function MealPicker({
    open,
    onClose,
    meals,
    onPick,
    onList,
}: {
    open: boolean
    onClose: () => void
    meals: Meal[]
    onPick: (meal: Meal) => void
    onList: Set<string>
}) {
    const [q, setQ] = useState('')
    const close = () => {
        setQ('')
        onClose()
    }
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase()
        return meals
            .filter((m) => !needle || m.name.toLowerCase().includes(needle))
            .sort((a, b) => Number(b.ingredients.length > 0) - Number(a.ingredients.length > 0))
    }, [meals, q])

    return (
        <BottomSheet open={open} onClose={close} title="What are you making?">
            <div className="flex flex-col gap-3">
                <Input
                    aria-label="Search meals"
                    placeholder="Search your meals…"
                    icon="fa-solid fa-magnifying-glass"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                {shown.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-500">No meals match.</p>
                ) : (
                    <ul className="-mx-2 flex flex-col">
                        {shown.map((m) => {
                            const added = onList.has(m._id)
                            return (
                                <li key={m._id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQ('')
                                            onPick(m)
                                        }}
                                        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-neutral-50"
                                    >
                                        {m.types[0] ? (
                                            <CategoryIcon type={m.types[0]} size="sm" />
                                        ) : (
                                            <span className="h-7 w-7 shrink-0" />
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-neutral-900">
                                                {m.name}
                                            </span>
                                            <span className="block truncate text-xs text-neutral-500">
                                                {m.batchOf && m.batchOf > 1
                                                    ? `Tray · ${m.batchOf} boxes · `
                                                    : ''}
                                                {m.ingredients.length > 0
                                                    ? plural(m.ingredients.length, 'ingredient')
                                                    : 'No ingredients yet'}
                                            </span>
                                        </span>
                                        <i
                                            className={`fa-solid ${added ? 'fa-check text-emerald-600' : 'fa-plus text-neutral-400'} text-xs`}
                                            aria-label={
                                                added ? 'Already added — adds one more' : undefined
                                            }
                                        />
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </BottomSheet>
    )
}

type Step = 'plan' | 'shop' | 'portion'
const STEP_KEY = 'nutrition.aheadStep'

function readStep(): Step {
    try {
        const v = localStorage.getItem(STEP_KEY)
        return v === 'shop' || v === 'portion' ? v : 'plan'
    } catch {
        return 'plan'
    }
}

/** Plan · Shop · Portion — the order a batch cook happens in, each with where it stands. */
function StepBar({
    step,
    onStep,
    steps,
}: {
    step: Step
    onStep: (s: Step) => void
    steps: { key: Step; label: string; status: string; done: boolean }[]
}) {
    return (
        <nav aria-label="Batch cook steps" className="grid grid-cols-3 gap-2">
            {steps.map((s, n) => {
                const on = s.key === step
                return (
                    <button
                        key={s.key}
                        type="button"
                        aria-current={on ? 'step' : undefined}
                        onClick={() => onStep(s.key)}
                        className={`flex min-h-16 min-w-0 flex-col justify-center gap-1 rounded-2xl bg-white px-3 py-2.5 text-left transition-shadow sm:px-4 ${
                            on
                                ? 'ring-2 ring-neutral-900'
                                : 'ring-1 ring-neutral-900/[0.06] hover:ring-neutral-300'
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <span
                                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                                    s.done && !on
                                        ? 'bg-emerald-600 text-white'
                                        : on
                                          ? 'bg-neutral-900 text-white'
                                          : 'bg-neutral-100 text-neutral-600'
                                }`}
                            >
                                {s.done && !on ? (
                                    <i
                                        className="fa-solid fa-check text-[9px]"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    n + 1
                                )}
                            </span>
                            <span className="truncate text-sm font-semibold text-neutral-900">
                                {s.label}
                            </span>
                        </span>
                        <span className="truncate text-xs text-neutral-500">{s.status}</span>
                    </button>
                )
            })}
        </nav>
    )
}

/** A quiet "carry on" link at the foot of a step. */
function NextStep({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <div className="flex justify-end">
            <Button
                variant="secondary"
                icon="fa-solid fa-arrow-right"
                iconPosition="right"
                onClick={onClick}
            >
                {label}
            </Button>
        </div>
    )
}

export default function ThinkingAhead({
    meals,
    list,
    onChange,
}: {
    meals: Meal[]
    list: ShoppingList
    onChange: (list: ShoppingList) => void
}) {
    const toast = useToast()
    const [picking, setPicking] = useState(false)
    const [text, setText] = useState('')
    const [confirmClear, setConfirmClear] = useState(false)
    const [step, setStepState] = useState<Step>(readStep)
    const sides = useSideMarks()

    const setStep = (s: Step) => {
        setStepState(s)
        try {
            localStorage.setItem(STEP_KEY, s)
        } catch {
            /* not remembered */
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    function run(fn: () => Promise<ShoppingList>) {
        fn()
            .then(onChange)
            .catch(() => toast.show('Could not update the shopping list.', 'danger'))
    }

    function pick(meal: Meal) {
        setPicking(false)
        const tray = meal.batchOf && meal.batchOf > 1 ? meal.batchOf : 1
        run(() => addToShopping('meal', meal._id, tray))
    }

    function submit() {
        const name = text.trim()
        if (!name) return
        setText('')
        run(() => addShoppingItem(name))
    }

    const byId = useMemo(() => new Map(meals.map((m) => [m._id, m])), [meals])
    const cooking = list.groups.filter((g) => g.kind !== 'item')
    const onList = new Set(cooking.map((g) => g.ref).filter((x): x is string => !!x))
    const ticked = tickedKeys(list.ticked)
    const lines = mergeLines(list.groups)
    const toGet = lines.filter((l) => !ticked.has(l.key))
    const inBasket = lines.filter((l) => ticked.has(l.key))
    const portions = cooking.reduce((n, g) => {
        const tray = trayOf(g)
        return n + (tray ? traysFor(g.count, tray) * tray : g.count)
    }, 0)
    const portionable = cooking.filter((g) => g.ref && byId.has(g.ref)).length

    const steps = [
        {
            key: 'plan' as const,
            label: 'Plan',
            status: cooking.length
                ? `${plural(cooking.length, 'meal')} · ${plural(portions, 'portion')}`
                : 'Pick meals',
            done: cooking.length > 0,
        },
        {
            key: 'shop' as const,
            label: 'Shop',
            status:
                lines.length === 0
                    ? 'Nothing yet'
                    : toGet.length
                      ? `${toGet.length} to buy`
                      : 'All bought',
            done: lines.length > 0 && toGet.length === 0,
        },
        {
            key: 'portion' as const,
            label: 'Portion',
            status: portionable ? 'Weigh & split' : 'After cooking',
            done: false,
        },
    ]

    const line = (l: (typeof lines)[number]) => {
        const done = ticked.has(l.key)
        const item = l.item
        const side = sides.isSide(l.name)
        return (
            <li key={l.key} className="flex min-h-14 items-center gap-1 pr-1">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => run(() => tickShopping(l.name, !done))}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-2 text-left"
                >
                    <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                            done
                                ? 'border-neutral-900 bg-neutral-900 text-white'
                                : 'border-neutral-300'
                        }`}
                    >
                        {done && <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span
                            className={`block truncate text-sm font-medium ${
                                done ? 'text-neutral-400 line-through' : 'text-neutral-900'
                            }`}
                        >
                            {l.name}
                        </span>
                        {l.from.length > 0 && (
                            <span className="block truncate text-xs text-neutral-500">
                                {l.from.join(', ')}
                            </span>
                        )}
                    </span>
                    {lineAmount(l) && (
                        <span
                            className={`shrink-0 text-sm font-medium tabular-nums ${done ? 'text-neutral-400' : 'text-neutral-700'}`}
                        >
                            {lineAmount(l)}
                        </span>
                    )}
                </button>
                {l.from.length > 0 && (
                    <button
                        type="button"
                        aria-pressed={side}
                        aria-label={`${l.name} is a side`}
                        title="A side is cooked in its own pot and weighed out on its own"
                        onClick={() => sides.setSide(l.name, !side)}
                        className="grid h-11 shrink-0 place-items-center px-1.5"
                    >
                        <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                side
                                    ? 'bg-neutral-900 text-white'
                                    : 'text-neutral-400 ring-1 ring-inset ring-neutral-200 hover:text-neutral-700'
                            }`}
                        >
                            Side
                        </span>
                    </button>
                )}
                {item && (
                    <button
                        type="button"
                        aria-label={`Remove ${l.name}`}
                        onClick={() => run(() => deleteShoppingGroup(item.id))}
                        className="grid h-11 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                )}
            </li>
        )
    }

    return (
        <div className="flex max-w-3xl flex-col gap-6">
            <StepBar step={step} onStep={setStep} steps={steps} />

            {step === 'plan' && (
                <section className="flex flex-col gap-3">
                    <SectionHead
                        title="What you’re cooking"
                        aside={
                            list.groups.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmClear(true)}
                                >
                                    Start over
                                </Button>
                            )
                        }
                    />
                    {cooking.length === 0 ? (
                        <div className={CARD}>
                            <EmptyState
                                icon="fa-solid fa-kitchen-set"
                                title="Plan your next cook"
                                description="Add the meals you’re batching and how many of each. Their ingredients become one shopping list."
                                action={
                                    <Button
                                        icon="fa-solid fa-plus"
                                        onClick={() => setPicking(true)}
                                    >
                                        Add a meal
                                    </Button>
                                }
                            />
                        </div>
                    ) : (
                        <ul className={`${CARD} divide-y divide-neutral-100`}>
                            {cooking.map((g) => (
                                <CookRow
                                    key={g.id}
                                    group={g}
                                    meal={g.ref ? byId.get(g.ref) : undefined}
                                    run={run}
                                />
                            ))}
                            <li>
                                <button
                                    type="button"
                                    onClick={() => setPicking(true)}
                                    className="flex min-h-14 w-full items-center gap-3 px-3 text-left text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-dashed border-neutral-300 text-neutral-500">
                                        <i
                                            className="fa-solid fa-plus text-xs"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    Add a meal
                                </button>
                            </li>
                        </ul>
                    )}
                    {cooking.some((g) => g.ingredients.length === 0) && (
                        <p className="px-1 text-xs text-neutral-500">
                            A meal with no ingredients goes on the list as itself. Add its
                            ingredients in the Library to split it out.
                        </p>
                    )}
                    {cooking.length > 0 && (
                        <NextStep
                            label={
                                toGet.length ? `Shop · ${plural(toGet.length, 'thing')}` : 'Shop'
                            }
                            onClick={() => setStep('shop')}
                        />
                    )}
                </section>
            )}

            {step === 'shop' && (
                <section className="flex flex-col gap-3">
                    <SectionHead
                        title="Shopping list"
                        aside={
                            inBasket.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => run(() => clearShopping(true))}
                                >
                                    Clear bought
                                </Button>
                            )
                        }
                    />
                    {lines.length > 0 && (
                        <div className="flex items-center gap-3 px-1">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
                                <div
                                    className="h-full rounded-full bg-neutral-900 transition-[width] duration-300"
                                    style={{ width: `${(inBasket.length / lines.length) * 100}%` }}
                                />
                            </div>
                            <span className="shrink-0 text-xs text-neutral-500">
                                <span className="tabular-nums">{inBasket.length}</span> of{' '}
                                <span className="tabular-nums">{lines.length}</span> bought
                            </span>
                        </div>
                    )}
                    <div className={CARD}>
                        <form
                            className="flex items-center gap-2 border-b border-neutral-100 p-2"
                            onSubmit={(e) => {
                                e.preventDefault()
                                submit()
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
                            <Button
                                type="submit"
                                icon="fa-solid fa-plus"
                                disabled={!text.trim()}
                                aria-label="Add"
                            >
                                <span className="hidden sm:inline">Add</span>
                            </Button>
                        </form>
                        {lines.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-neutral-500">
                                Add meals in Plan and their ingredients land here, one line each.
                            </p>
                        ) : (
                            <>
                                {toGet.length > 0 ? (
                                    <ul className="divide-y divide-neutral-100">
                                        {toGet.map(line)}
                                    </ul>
                                ) : (
                                    <p className="px-4 py-6 text-center text-sm text-neutral-600">
                                        <i
                                            className="fa-solid fa-check mr-1.5 text-emerald-600"
                                            aria-hidden="true"
                                        />
                                        Everything’s in the basket.
                                    </p>
                                )}
                                {inBasket.length > 0 && (
                                    <>
                                        <p
                                            className={`${OVERLINE} border-t border-neutral-100 bg-neutral-50 px-4 py-2`}
                                        >
                                            In the basket
                                        </p>
                                        <ul className="divide-y divide-neutral-100">
                                            {inBasket.map(line)}
                                        </ul>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    {lines.length > 0 && (
                        <p className="px-1 text-xs text-neutral-500">
                            Tap <span className="font-medium text-neutral-700">Side</span> on
                            anything cooked in its own pot (rice, pasta) — you’ll weigh it on its
                            own when portioning.
                        </p>
                    )}
                    {portionable > 0 && (
                        <NextStep label="Portion" onClick={() => setStep('portion')} />
                    )}
                </section>
            )}

            {step === 'portion' &&
                (portionable > 0 ? (
                    <Portioning cooking={cooking} byId={byId} sides={sides} />
                ) : (
                    <div className={CARD}>
                        <EmptyState
                            icon="fa-solid fa-scale-balanced"
                            title="Nothing to portion yet"
                            description="Add the meals you’re cooking in Plan. After cooking, weigh each pot here and it tells you what goes in every box."
                            action={
                                <Button variant="secondary" onClick={() => setStep('plan')}>
                                    Go to Plan
                                </Button>
                            }
                        />
                    </div>
                ))}

            <MealPicker
                open={picking}
                onClose={() => setPicking(false)}
                meals={meals}
                onPick={pick}
                onList={onList}
            />
            <ConfirmModal
                open={confirmClear}
                onClose={() => setConfirmClear(false)}
                title="Start over?"
                message="Clears the meals you’re cooking and the whole shopping list. Your meals in the Library stay as they are."
                confirmLabel="Start over"
                danger
                onConfirm={() => run(() => clearShopping(false))}
            />
        </div>
    )
}
