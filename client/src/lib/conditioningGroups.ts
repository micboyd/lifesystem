import { useEffect, useSyncExternalStore } from 'react'
import type { ConditioningGroup, ConditioningGroupColor } from '../types'
import * as groupApi from '../services/conditioningGroups'

/**
 * The classes each category colour renders with: a solid swatch (picker, bar),
 * a soft chip, and the tint a planner tile/row takes. Literal so Tailwind keeps them.
 */
export const GROUP_TONE: Record<
    ConditioningGroupColor,
    { name: string; dot: string; chip: string; block: string }
> = {
    sky: { name: 'Blue', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-600/20', block: 'bg-sky-100' },
    emerald: {
        name: 'Green',
        dot: 'bg-emerald-500',
        chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
        block: 'bg-emerald-100',
    },
    amber: {
        name: 'Amber',
        dot: 'bg-amber-500',
        chip: 'bg-amber-50 text-amber-700 ring-amber-600/20',
        block: 'bg-amber-100',
    },
    rose: { name: 'Red', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-600/20', block: 'bg-rose-100' },
    violet: {
        name: 'Purple',
        dot: 'bg-violet-500',
        chip: 'bg-violet-50 text-violet-700 ring-violet-600/20',
        block: 'bg-violet-100',
    },
    teal: { name: 'Teal', dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700 ring-teal-600/20', block: 'bg-teal-100' },
    orange: {
        name: 'Orange',
        dot: 'bg-orange-500',
        chip: 'bg-orange-50 text-orange-700 ring-orange-600/20',
        block: 'bg-orange-100',
    },
    slate: {
        name: 'Grey',
        dot: 'bg-slate-500',
        chip: 'bg-slate-100 text-slate-700 ring-slate-600/20',
        block: 'bg-slate-200',
    },
}

// One shared list for the library, the session form and the planner, fetched once.
let groups: ConditioningGroup[] = []
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: ConditioningGroup[]) {
    groups = [...next].sort((a, b) => a.order - b.order)
    loaded = true
    listeners.forEach((l) => l())
}

function load(): Promise<void> {
    if (!loading)
        loading = groupApi
            .listGroups()
            .then(set)
            .catch(() => {
                loading = null
            })
    return loading
}

function subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
}

/** The user's conditioning categories, kept in step wherever they're shown. */
export function useConditioningGroups(): ConditioningGroup[] {
    useEffect(() => {
        if (!loaded) void load()
    }, [])
    return useSyncExternalStore(subscribe, () => groups, () => groups)
}

/** The category a session points at, if it still exists. */
export function findGroup(list: ConditioningGroup[], id: string | null | undefined) {
    return id ? list.find((g) => g._id === id) : undefined
}

export async function addGroup(name: string, color: ConditioningGroupColor) {
    const g = await groupApi.createGroup({ name, color })
    set([...groups, g])
}

export async function saveGroup(
    id: string,
    fields: Partial<Pick<ConditioningGroup, 'name' | 'color'>>
) {
    const g = await groupApi.updateGroup(id, fields)
    set(groups.map((x) => (x._id === id ? g : x)))
}

export async function removeGroup(id: string) {
    await groupApi.deleteGroup(id)
    set(groups.filter((x) => x._id !== id))
}
