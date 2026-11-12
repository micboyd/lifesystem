import { useCallback, useEffect, useState } from 'react'
import { addToShopping, getShopping } from '../../services/shopping'
import { mergeLines, tickedKeys, trayOf, traysFor } from '../../lib/shopping'
import { useToast } from '../../context/ToastContext'
import type { ShoppingGroup, ShoppingList } from '../../types'

/**
 * The shopping list's shared pieces: the hook that holds it, the cart button
 * on a Library card, and the header pill that jumps to Thinking ahead (where
 * the list is planned and shopped — see ThinkingAhead.tsx).
 */

export type ShopKind = 'meal'

const EMPTY: ShoppingList = { groups: [], ticked: [] }

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The list, and adding to it from anywhere. A tray goes on a whole tray at a time. */
export function useShopping() {
    const toast = useToast()
    const [list, setList] = useState<ShoppingList>(EMPTY)
    useEffect(() => {
        getShopping()
            .then(setList)
            .catch(() => {})
    }, [])

    const add = useCallback(
        async (kind: ShopKind, id: string, name: string, batchOf?: number | null) => {
            const tray = batchOf && batchOf > 1 ? batchOf : null
            try {
                const next = await addToShopping(kind, id, tray ?? 1)
                setList(next)
                const g = next.groups.find((x) => x.ref === id)
                toast.show(g ? `${name}: ${countLabel(g)} in Thinking ahead.` : `Added ${name} to Thinking ahead.`)
            } catch {
                toast.show('Could not add that to the shopping list.', 'danger')
            }
        },
        [toast]
    )

    return { list, setList, add }
}

/** "2 trays · 10 boxes" for a tray, "7 portions" for a meal. */
export function countLabel(g: ShoppingGroup): string {
    const tray = trayOf(g)
    if (!tray) return plural(g.count, 'portion')
    const trays = traysFor(g.count, tray)
    return `${plural(trays, 'tray')} · ${plural(trays * tray, 'box', 'boxes')}`
}

/** Lines still to get. */
export function leftToGet(list: ShoppingList): number {
    const ticked = tickedKeys(list.ticked)
    return mergeLines(list.groups).filter((l) => !ticked.has(l.key)).length
}

/** The header pill: how many things are left to buy. Opens Thinking ahead. */
export function ShoppingPill({ list, onOpen }: { list: ShoppingList; onOpen: () => void }) {
    const left = leftToGet(list)
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
            aria-label={`Add ${name} to Thinking ahead`}
            title="Add to Thinking ahead"
            onClick={onClick}
            className="relative z-20 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
            <i className="fa-solid fa-cart-plus text-[13px]" aria-hidden="true" />
        </button>
    )
}
