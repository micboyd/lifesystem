import type { TimeboxCategory } from '../../types'

/**
 * Each category's colour. `solid` fills the day strip; `bar` is the thin accent
 * down the left of an agenda card; `dot` marks a category in lists; `outline`
 * is a planned item's dashed border.
 */
export const CATEGORY_STYLE: Record<
    TimeboxCategory | 'none',
    { label: string; solid: string; dot: string; outline: string; bar: string }
> = {
    work: {
        label: 'Work',
        solid: 'bg-sky-600',
        dot: 'bg-sky-600',
        outline: 'border-sky-500 text-sky-800',
        bar: 'bg-sky-500',
    },
    personal: {
        label: 'Personal',
        solid: 'bg-violet-600',
        dot: 'bg-violet-600',
        outline: 'border-violet-500 text-violet-800',
        bar: 'bg-violet-500',
    },
    health: {
        label: 'Health',
        solid: 'bg-emerald-600',
        dot: 'bg-emerald-600',
        outline: 'border-emerald-500 text-emerald-800',
        bar: 'bg-emerald-500',
    },
    learning: {
        label: 'Learning',
        solid: 'bg-amber-600',
        dot: 'bg-amber-600',
        outline: 'border-amber-500 text-amber-800',
        bar: 'bg-amber-500',
    },
    social: {
        label: 'Social',
        solid: 'bg-coral-500',
        dot: 'bg-coral-500',
        outline: 'border-coral-400 text-coral-700',
        bar: 'bg-coral-400',
    },
    travel: {
        label: 'Travel',
        solid: 'bg-fuchsia-600',
        dot: 'bg-fuchsia-500',
        outline: 'border-fuchsia-400 text-fuchsia-700',
        bar: 'bg-fuchsia-500',
    },
    none: {
        label: 'None',
        solid: 'bg-neutral-700',
        dot: 'bg-neutral-700',
        outline: 'border-neutral-400 text-neutral-700',
        bar: 'bg-neutral-400',
    },
}
