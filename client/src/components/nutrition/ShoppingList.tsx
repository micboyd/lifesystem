import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import EmptyState from '../EmptyState'
import {
    addShoppingItem,
    addToShopping,
    clearShopping,
    deleteShoppingGroup,
    getShopping,
    setShoppingCount,
    tickShopping,
} from '../../services/shopping'
import { Segmented } from '../planner/PlannerParts'
import { lineAmount, mergeLines, trayOf, traysFor, type ShopMode } from '../../lib/shopping'
import { useToast } from '../../context/ToastContext'
import type { ShoppingGroup, ShoppingList } from '../../types'

/**
 * The shopping list: built by tapping the cart on a meal card, and opened
 * from the pill in the module header. What you've added sits at the top with
 * a − / + for how many servings; below is one list
 * with a single line per ingredient, adding up everything that needs it.
 */

export type ShopKind = 'meal'

const EMPTY: ShoppingList = { groups: [], ticked: [] }

const MODE_KEY = 'nutrition.shopMode'

function readMode(): ShopMode {
    try {
        return localStorage.getItem(MODE_KEY) === 'batch' ? 'batch' : 'servings'
    } catch {
        return 'servings'
    }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The list, adding to it from any card, and whether trays are shopped by the box or by the tray. */
export function useShopping() {
    const toast = useToast()
    const [list, setList] = useState<ShoppingList>(EMPTY)
    const [mode, setModeState] = useState<ShopMode>(readMode)
    const setMode = useCallback((m: ShopMode) => {
        setModeState(m)
        try {
            localStorage.setItem(MODE_KEY, m)
        } catch {
            // Remembering it is only a convenience.
        }
    }, [])
    useEffect(() => {
        getShopping()
            .then(setList)
            .catch(() => {})
    }, [])

    // A tray goes on a whole tray at a time when shopping by batch, a box at a time otherwise.
    const add = useCallback(
        async (kind: ShopKind, id: string, name: string, batchOf?: number | null) => {
            const tray = batchOf && batchOf > 1 ? batchOf : null
            try {
                const next = await addToShopping(kind, id, tray && mode === 'batch' ? tray : 1)
                setList(next)
                const g = next.groups.find((x) => x.ref === id)
                const amount = g && (tray ? countLabel(g, mode) : g.count > 1 ? `×${g.count}` : '')
                toast.show(amount ? `${name}: ${amount} on the shopping list.` : `Added ${name} to the shopping list.`)
            } catch {
                toast.show('Could not add that to the shopping list.', 'danger')
            }
        },
        [toast, mode]
    )

    return { list, setList, add, mode, setMode }
}

/** "2 trays · 10 boxes" or "3 boxes" for a tray, "2 servings" for a meal. */
function countLabel(g: ShoppingGroup, mode: ShopMode): string {
    const tray = trayOf(g)
    if (!tray) return plural(g.count, 'serving')
    if (mode === 'servings') return plural(g.count, 'box', 'boxes')
    const trays = traysFor(g.count, tray)
    return `${plural(trays, 'tray')} · ${plural(trays * tray, 'box', 'boxes')}`
}

/** Lines still to get. */
function leftToGet(list: ShoppingList, mode: ShopMode): number {
    const ticked = new Set(list.ticked)
    return mergeLines(list.groups, mode).filter((l) => !ticked.has(l.key)).length
}

/** The header pill: how many things are left to buy. */
export function ShoppingPill({ list, mode, onOpen }: { list: ShoppingList; mode: ShopMode; onOpen: () => void }) {
    const left = leftToGet(list, mode)
    return (
        <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-neutral-800 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-50"
        >
            <i className="fa-solid fa-cart-shopping text-[13px] text-neutral-500" aria-hidden="true" />
            Shopping list
            {left > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-coral-500 px-1.5 text-[11px] font-semibold tabular-nums text-white">
                    {left}
                </span>
            )}
        </button>
    )
}

/** The cart button on a meal card. */
export function ShopButton({ name, onClick }: { name: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={`Add ${name} to the shopping list`}
            title="Add to shopping list"
            onClick={onClick}
            className="relative z-20 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
            <i className="fa-solid fa-cart-plus text-[13px]" aria-hidden="true" />
        </button>
    )
}

/** − n + . At one, the minus takes it off the list. */
function Stepper({
    name,
    count,
    onChange,
    onRemove,
}: {
    name: string
    count: number
    onChange: (n: number) => void
    onRemove: () => void
}) {
    const btn =
        'grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-white hover:text-neutral-900'
    return (
        <div className="flex shrink-0 items-center rounded-full bg-neutral-100 p-0.5">
            {count > 1 ? (
                <button type="button" aria-label={`One fewer ${name}`} onClick={() => onChange(count - 1)} className={btn}>
                    <i className="fa-solid fa-minus text-[11px]" aria-hidden="true" />
                </button>
            ) : (
                <button type="button" aria-label={`Take ${name} off the list`} onClick={onRemove} className={btn}>
                    <i className="fa-solid fa-trash-can text-[11px]" aria-hidden="true" />
                </button>
            )}
            <span className="min-w-6 text-center text-sm font-semibold tabular-nums text-neutral-900">{count}</span>
            <button type="button" aria-label={`One more ${name}`} onClick={() => onChange(count + 1)} className={btn}>
                <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
            </button>
        </div>
    )
}

const ADDED: Record<Exclude<ShoppingGroup['kind'], 'item'>, { icon: string; tone: string; label: string }> = {
    box: { icon: 'fa-box', tone: 'bg-amber-50 text-amber-600', label: 'Box' },
    meal: { icon: 'fa-utensils', tone: 'bg-coral-50 text-coral-600', label: 'Meal' },
    food: { icon: 'fa-bowl-rice', tone: 'bg-neutral-100 text-neutral-500', label: 'Food' },
}

function SectionTitle({ children }: { children: ReactNode }) {
    return <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">{children}</h3>
}

/** A tickable line: box, name, amount on the right. */
function TickRow({
    label,
    sub,
    amount,
    done,
    onToggle,
    trailing,
}: {
    label: string
    sub?: string
    amount?: string
    done: boolean
    onToggle: () => void
    trailing?: ReactNode
}) {
    return (
        <li className="flex min-h-12 items-center gap-1 pr-1">
            <button
                type="button"
                role="checkbox"
                aria-checked={done}
                onClick={onToggle}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-2 text-left"
            >
                <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                        done ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
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
                        {label}
                    </span>
                    {sub && <span className="block truncate text-xs text-neutral-500">{sub}</span>}
                </span>
                {amount && (
                    <span className={`shrink-0 text-sm tabular-nums ${done ? 'text-neutral-400' : 'text-neutral-600'}`}>
                        {amount}
                    </span>
                )}
            </button>
            {trailing}
        </li>
    )
}

export function ShoppingDrawer({
    open,
    onClose,
    list,
    onChange,
    mode,
    onMode,
}: {
    open: boolean
    onClose: () => void
    list: ShoppingList
    onChange: (list: ShoppingList) => void
    mode: ShopMode
    onMode: (mode: ShopMode) => void
}) {
    const toast = useToast()
    const [text, setText] = useState('')

    async function run(fn: () => Promise<ShoppingList>) {
        try {
            onChange(await fn())
        } catch {
            toast.show('Could not update the shopping list.', 'danger')
        }
    }

    function submit() {
        const name = text.trim()
        if (!name) return
        setText('')
        void run(() => addShoppingItem(name))
    }

    const added = list.groups.filter((g) => g.kind !== 'item')
    const ticked = new Set(list.ticked)
    const lines = mergeLines(list.groups, mode)
    const hasTrays = added.some((g) => trayOf(g))
    // Still to get first, then what's in the basket.
    const sorted = [...lines.filter((l) => !ticked.has(l.key)), ...lines.filter((l) => ticked.has(l.key))]
    const left = lines.filter((l) => !ticked.has(l.key)).length

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="lg"
            title="Shopping list"
            badge={lines.length ? `${left} to get` : undefined}
            footer={
                list.groups.length > 0 && (
                    <div className="flex w-full items-center gap-2">
                        <Button variant="ghost" className="mr-auto" onClick={() => void run(() => clearShopping(false))}>
                            Clear all
                        </Button>
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-check"
                            disabled={list.ticked.length === 0}
                            onClick={() => void run(() => clearShopping(true))}
                        >
                            Clear bought
                        </Button>
                    </div>
                )
            }
        >
            <div className="flex flex-col gap-6">
                <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        submit()
                    }}
                >
                    <div className="min-w-0 flex-1">
                        <Input
                            aria-label="Add an item"
                            placeholder="Add something…"
                            enterKeyHint="done"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </div>
                    <Button type="submit" icon="fa-solid fa-plus" disabled={!text.trim()} aria-label="Add">
                        <span className="hidden sm:inline">Add</span>
                    </Button>
                </form>

                {hasTrays && (
                    <div className="flex flex-col gap-1.5">
                        <Segmented
                            value={mode}
                            options={[
                                ['servings', 'Servings'],
                                ['batch', 'Batch amounts'],
                            ]}
                            onChange={onMode}
                        />
                        <p className="text-xs text-neutral-500">
                            {mode === 'batch'
                                ? 'Trays are bought whole — enough trays to cover the boxes.'
                                : 'Trays are bought by the box — just the share you need.'}
                        </p>
                    </div>
                )}

                {list.groups.length === 0 && (
                    <EmptyState
                        icon="fa-solid fa-cart-shopping"
                        title="Nothing on the list"
                        description="Tap the cart on a meal in the Library. A meal with ingredients adds them; a tray adds a box’s worth, or a whole tray with Batch amounts on."
                    />
                )}

                {added.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <SectionTitle>Shopping for</SectionTitle>
                        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl ring-1 ring-neutral-900/[0.06]">
                            {added.map((g) => {
                                const tray = trayOf(g)
                                const look = tray ? ADDED.box : ADDED[g.kind as keyof typeof ADDED]
                                // By batch, a tray steps a whole tray at a time.
                                const byTray = tray && mode === 'batch' ? tray : null
                                const shown = byTray ? traysFor(g.count, byTray) : g.count
                                return (
                                    <li key={g.id} className="flex min-h-14 items-center gap-3 py-2 pl-3 pr-2">
                                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${look.tone}`}>
                                            <i className={`fa-solid ${look.icon} text-xs`} aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-neutral-900">{g.name}</p>
                                            <p className="text-xs text-neutral-500">
                                                {g.kind === 'box'
                                                    ? plural(g.count, 'batch', 'batches')
                                                    : g.kind === 'meal' && (tray || g.ingredients.length > 0)
                                                      ? countLabel(g, mode)
                                                      : look.label}
                                            </p>
                                        </div>
                                        <Stepper
                                            name={g.name}
                                            count={shown}
                                            onChange={(n) =>
                                                void run(() => setShoppingCount(g.id, byTray ? n * byTray : n))
                                            }
                                            onRemove={() => void run(() => deleteShoppingGroup(g.id))}
                                        />
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                )}

                {sorted.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <SectionTitle>List</SectionTitle>
                        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl ring-1 ring-neutral-900/[0.06]">
                            {sorted.map((l) => {
                                const done = ticked.has(l.key)
                                const item = l.item
                                return (
                                    <TickRow
                                        key={l.key}
                                        label={l.name}
                                        sub={l.from.length ? `For ${l.from.join(', ')}` : undefined}
                                        amount={lineAmount(l)}
                                        done={done}
                                        onToggle={() => void run(() => tickShopping(l.name, !done))}
                                        trailing={
                                            item && (
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${l.name}`}
                                                    onClick={() => void run(() => deleteShoppingGroup(item.id))}
                                                    className="grid h-11 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:text-neutral-700"
                                                >
                                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                                </button>
                                            )
                                        }
                                    />
                                )
                            })}
                        </ul>
                    </section>
                )}
            </div>
        </Drawer>
    )
}
