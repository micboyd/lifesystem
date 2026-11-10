import type { TimeboxCategory } from '../../types'

/**
 * Each category's solid colour. Blocks are filled with it and carry white
 * text, so the day reads as a strip of colour rather than a stack of cards.
 * `soft` is the pale tint for a planned item's dashed outline.
 */
export const CATEGORY_STYLE: Record<
    TimeboxCategory | 'none',
    { label: string; solid: string; dot: string; outline: string }
> = {
    work: { label: 'Work', solid: 'bg-sky-600', dot: 'bg-sky-600', outline: 'border-sky-500 text-sky-800' },
    personal: { label: 'Personal', solid: 'bg-violet-600', dot: 'bg-violet-600', outline: 'border-violet-500 text-violet-800' },
    health: { label: 'Health', solid: 'bg-emerald-600', dot: 'bg-emerald-600', outline: 'border-emerald-500 text-emerald-800' },
    learning: { label: 'Learning', solid: 'bg-amber-600', dot: 'bg-amber-600', outline: 'border-amber-500 text-amber-800' },
    social: { label: 'Social', solid: 'bg-coral-500', dot: 'bg-coral-500', outline: 'border-coral-400 text-coral-700' },
    none: { label: 'None', solid: 'bg-neutral-700', dot: 'bg-neutral-700', outline: 'border-neutral-400 text-neutral-700' },
}
