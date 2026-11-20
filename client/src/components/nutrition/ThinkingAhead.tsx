import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from '../BottomSheet'
import Input from '../Input'
import ConfirmModal from '../ConfirmModal'
import { Bar, BarButton, CAPS, DoneTick, Eyebrow, SectionTitle } from '../Blok'
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
 * Thinking ahead: plan a cook, full screen. Three steps in the order a batch
 * cook happens — Plan (the meals and how many of each), Shop (every
 * ingredient merged into one line) and Portion (weigh each pot, split it into
 * boxes). A rail across the top says where each step stands; Back / Next sit
 * at the foot. Nothing is tracked after the cook — start over for the next one.
 */

const MAX = 99
const ICON_BTN =
    'grid h-11 w-11 shrink-0 place-items-center text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 lg:h-10 lg:w-10'

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
        'grid h-11 w-10 place-items-center text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40 lg:h-10'
    return (
        <div className="flex shrink-0 items-center border border-neutral-300">
            {value > 1 ? (
                <button type="button" aria-label={`One fewer ${name}`} onClick={() => onChange(value - 1)} className={btn}>
                    <i className="fa-solid fa-minus text-[11px]" aria-hidden="true" />
                </button>
            ) : (
                <button type="button" aria-label={`Take ${name} off`} onClick={onRemove} className={btn}>
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
                className="h-11 w-10 border-x border-neutral-200 bg-transparent text-center text-[15px] tabular-nums outline-none focus-visible:shadow-[inset_0_-2px_0_#111111] lg:h-10"
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
        <li className="border-b border-hairline">
            <div className="flex min-h-[72px] items-center gap-3 py-3">
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
                        <span className="grid h-9 w-9 shrink-0 place-items-center bg-neutral-100 text-sm text-neutral-500">
                            <i className="fa-solid fa-utensils" aria-hidden="true" />
                        </span>
                    )}
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-neutral-900">{group.name}</span>
                        <span className="block truncate text-[13px] text-neutral-600">
                            {countLabel(group)}
                            {meal && (
                                <>
                                    {' · '}
                                    <span className="tabular-nums">{Math.round(meal.macros.calories)}</span> kcal each
                                </>
                            )}
                            {!hasIngredients && <span className="text-amber-700"> · no ingredients yet</span>}
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
                <ul className="mb-4 ml-12 border-l-2 border-neutral-900 pl-4">
                    {mergeLines([group]).map((l) => (
                        <li key={l.key} className="flex items-center justify-between gap-3 py-1.5 text-[14px]">
                            <span className="truncate text-neutral-700">{l.name}</span>
                            <span className="shrink-0 tabular-nums text-neutral-600">{lineAmount(l) || '×1'}</span>
                        </li>
                    ))}
                    <li className="pt-1.5 text-[12px] text-neutral-500">
                        {tray ? `Each tray makes ${plural(tray, 'box', 'boxes')}.` : `${plural(times, 'portion')}’ worth.`}
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
                    <ul className="flex flex-col border-t border-hairline">
                        {shown.map((m) => {
                            const added = onList.has(m._id)
                            return (
                                <li key={m._id} className="border-b border-hairline">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQ('')
                                            onPick(m)
                                        }}
                                        className="flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-neutral-50"
                                    >
                                        {m.types[0] ? <CategoryIcon type={m.types[0]} size="sm" /> : <span className="h-7 w-7 shrink-0" />}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-neutral-900">{m.name}</span>
                                            <span className="block truncate text-xs text-neutral-500">
                                                {m.batchOf && m.batchOf > 1 ? `Tray · ${m.batchOf} boxes · ` : ''}
                                                {m.ingredients.length > 0 ? plural(m.ingredients.length, 'ingredient') : 'No ingredients yet'}
                                            </span>
                                        </span>
                                        <i
                                            className={`fa-solid ${added ? 'fa-check text-emerald-600' : 'fa-plus text-neutral-400'} text-xs`}
                                            aria-label={added ? 'Already added — adds one more' : undefined}
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
const ORDER: Step[] = ['plan', 'shop', 'portion']
const STEP_KEY = 'nutrition.aheadStep'

function readStep(): Step {
    try {
        const v = localStorage.getItem(STEP_KEY)
        return v === 'shop' || v === 'portion' ? v : 'plan'
    } catch {
        return 'plan'
    }
}

/** Plan · Shop · Portion across the top: number (or tick), name, where it stands. */
function StepRail({
    step,
    onStep,
    steps,
}: {
    step: Step
    onStep: (s: Step) => void
    steps: { key: Step; label: string; status: string; done: boolean }[]
}) {
    return (
        <nav aria-label="Batch cook steps" className="grid grid-cols-3 border-b border-hairline">
            {steps.map((s, n) => {
                const on = s.key === step
                return (
                    <button
                        key={s.key}
                        type="button"
                        aria-current={on ? 'step' : undefined}
                        onClick={() => onStep(s.key)}
                        className={`-mb-px flex min-w-0 flex-col gap-1 border-b-2 px-3 py-3 text-left transition-colors sm:px-5 ${
                            on ? 'border-neutral-900' : 'border-transparent hover:bg-neutral-50'
                        } ${n > 0 ? 'border-l border-l-hairline' : ''}`}
                    >
                        <span className="flex items-center gap-2.5">
                            {s.done && !on ? (
                                <DoneTick size={18} />
                            ) : (
                                <span
                                    className={`grid h-[18px] w-[18px] shrink-0 place-items-center text-[11px] font-medium tabular-nums ${
                                        on ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
                                    }`}
                                >
                                    {n + 1}
                                </span>
                            )}
                            <span className={`${CAPS} truncate ${on ? 'text-neutral-900' : 'text-neutral-600'}`}>{s.label}</span>
                        </span>
                        <span className="truncate text-[12px] text-neutral-500 sm:text-[13px]">{s.status}</span>
                    </button>
                )
            })}
        </nav>
    )
}

/** Each step's own heading: "Step 1 of 3", a title, a line on what to do. */
function StepHead({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
                <Eyebrow>Step {n} of 3</Eyebrow>
                <div className="mt-3">
                    <SectionTitle>{title}</SectionTitle>
                </div>
                <p className="mt-3 max-w-[560px] text-[15px] leading-normal text-neutral-600">{children}</p>
            </div>
            {aside}
        </header>
    )
}

/** A big, quiet message when a step has nothing in it yet. */
function Empty({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-start gap-4 border-y border-hairline py-12">
            <span className="grid h-11 w-11 place-items-center bg-neutral-100 text-neutral-600">
                <i className={icon} aria-hidden="true" />
            </span>
            <div>
                <p className="text-[17px] font-medium text-neutral-900">{title}</p>
                <p className="mt-1 max-w-[480px] text-[14px] text-neutral-600">{children}</p>
            </div>
            {action}
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
    const navigate = useNavigate()
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
    const leave = () => navigate('/nutrition')

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
            status: cooking.length ? `${plural(cooking.length, 'meal')} · ${plural(portions, 'portion')}` : 'Pick meals',
            done: cooking.length > 0,
        },
        {
            key: 'shop' as const,
            label: 'Shop',
            status: lines.length === 0 ? 'Nothing yet' : toGet.length ? `${toGet.length} to buy` : 'All bought',
            done: lines.length > 0 && toGet.length === 0,
        },
        {
            key: 'portion' as const,
            label: 'Portion',
            status: portionable ? 'Weigh & split' : 'After cooking',
            done: false,
        },
    ]

    const at = ORDER.indexOf(step)
    const prev = at > 0 ? ORDER[at - 1] : null
    const next = at < ORDER.length - 1 ? ORDER[at + 1] : null
    const nextLabel =
        step === 'plan' ? (toGet.length ? `Shop · ${toGet.length}` : 'Shop') : step === 'shop' ? 'Portion' : 'Done'
    const footNote =
        step === 'plan'
            ? cooking.length
                ? `${plural(cooking.length, 'meal')} · ${plural(portions, 'portion')}`
                : 'Nothing planned yet'
            : step === 'shop'
              ? lines.length
                  ? `${inBasket.length} of ${lines.length} bought`
                  : 'Nothing to buy yet'
              : portionable
                ? `${plural(portionable, 'meal')} to portion`
                : 'Nothing to portion yet'

    const line = (l: (typeof lines)[number]) => {
        const done = ticked.has(l.key)
        const item = l.item
        const side = sides.isSide(l.name)
        return (
            <li key={l.key} className="flex min-h-14 items-center gap-1 border-b border-hairline">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => run(() => tickShopping(l.name, !done))}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 text-left"
                >
                    {done ? (
                        <DoneTick size={18} label="Bought" />
                    ) : (
                        <span className="h-[18px] w-[18px] shrink-0 border border-neutral-400" />
                    )}
                    <span className="min-w-0 flex-1">
                        <span
                            className={`block truncate text-[15px] ${done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}
                        >
                            {l.name}
                        </span>
                        {l.from.length > 0 && (
                            <span className="block truncate text-[12px] text-neutral-500">{l.from.join(', ')}</span>
                        )}
                    </span>
                    {lineAmount(l) && (
                        <span className={`shrink-0 text-[15px] tabular-nums ${done ? 'text-neutral-400' : 'text-neutral-800'}`}>
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
                    <button
                        type="button"
                        aria-label={`Remove ${l.name}`}
                        onClick={() => run(() => deleteShoppingGroup(item.id))}
                        className={ICON_BTN}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                )}
            </li>
        )
    }

    return (
        <div className="flex min-h-dvh flex-col bg-canvas">
            {/* Top: the way back, the name, and the three steps. */}
            <div className="sticky top-0 z-20 bg-canvas pt-[env(safe-area-inset-top)]">
                <div className="flex min-h-16 items-center gap-3 border-b border-hairline px-3 sm:px-8">
                    <button type="button" onClick={leave} aria-label="Back to Nutrition" className={ICON_BTN}>
                        <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className={`${CAPS} hidden text-neutral-500 sm:block`}>Nutrition</p>
                        <h1 className="truncate text-[17px] font-medium">Thinking ahead</h1>
                    </div>
                    {list.groups.length > 0 && (
                        <BarButton onClick={() => setConfirmClear(true)} className="!border-neutral-300">
                            Start over
                        </BarButton>
                    )}
                </div>
                <div className="mx-auto max-w-5xl sm:px-8">
                    <StepRail step={step} onStep={setStep} steps={steps} />
                </div>
            </div>

            <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-36 pt-10 sm:px-8 sm:pt-14">
                {step === 'plan' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={1} title="What are you cooking?">
                            The meals you’re batching and how many of each. Their ingredients become one shopping
                            list.
                        </StepHead>
                        {cooking.length === 0 ? (
                            <Empty
                                icon="fa-solid fa-kitchen-set"
                                title="Plan your next cook"
                                action={
                                    <BarButton solid onClick={() => setPicking(true)}>
                                        <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                                        Add a meal
                                    </BarButton>
                                }
                            >
                                Pick a meal from your Library, then say how many portions or trays.
                            </Empty>
                        ) : (
                            <div>
                                <ul className="border-t border-neutral-900">
                                    {cooking.map((g) => (
                                        <CookRow key={g.id} group={g} meal={g.ref ? byId.get(g.ref) : undefined} run={run} />
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    onClick={() => setPicking(true)}
                                    className="flex min-h-16 w-full items-center gap-3 border-b border-hairline text-left text-[15px] text-neutral-600 transition-colors hover:text-neutral-900"
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center border border-dashed border-neutral-400">
                                        <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                                    </span>
                                    Add a meal
                                </button>
                                {cooking.some((g) => g.ingredients.length === 0) && (
                                    <p className="mt-4 text-[13px] text-neutral-500">
                                        A meal with no ingredients goes on the list as itself. Add its ingredients in the
                                        Library to split it out.
                                    </p>
                                )}
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
                            Every ingredient on one line. Tap <span className="text-neutral-900">Side</span> on anything
                            cooked in its own pot (rice, pasta) — you’ll weigh it on its own when portioning.
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
                                <BarButton type="submit" solid disabled={!text.trim()}>
                                    Add
                                </BarButton>
                            </form>
                            {lines.length === 0 ? (
                                <p className="border-t border-hairline py-12 text-[14px] text-neutral-500">
                                    Add meals in Plan and their ingredients land here, one line each.
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

                {step === 'portion' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={3} title="Portion it out">
                            Weigh each pot after cooking — zero the scale with the empty pot first. You’ll see how much
                            of each goes in every box, and what one box gives you.
                        </StepHead>
                        {portionable > 0 ? (
                            <Portioning cooking={cooking} byId={byId} sides={sides} />
                        ) : (
                            <Empty
                                icon="fa-solid fa-scale-balanced"
                                title="Nothing to portion yet"
                                action={<BarButton onClick={() => setStep('plan')}>Go to Plan</BarButton>}
                            >
                                Add the meals you’re cooking in Plan. After cooking, weigh each pot here and it tells you
                                what goes in every box.
                            </Empty>
                        )}
                    </section>
                )}
            </main>

            {/* Foot: where this step stands, and Back / Next. */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto flex min-h-[72px] max-w-3xl items-center gap-3 px-5 sm:px-8">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">{footNote}</p>
                    {prev && (
                        <BarButton onClick={() => setStep(prev)} className="!border-neutral-300">
                            Back
                        </BarButton>
                    )}
                    {next ? (
                        <BarButton solid arrow onClick={() => setStep(next)}>
                            {nextLabel}
                        </BarButton>
                    ) : (
                        <BarButton solid onClick={leave}>
                            {nextLabel}
                        </BarButton>
                    )}
                </div>
            </div>

            <MealPicker open={picking} onClose={() => setPicking(false)} meals={meals} onPick={pick} onList={onList} />
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
