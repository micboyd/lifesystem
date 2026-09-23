import type { ReactNode } from 'react'
import type { Macros, PrepCategory } from '../../../types'
import { fmt, kcal } from '../format'

/** Small shared pieces for the meal-prep views. */

export const CATEGORY_LABEL: Record<PrepCategory, string> = {
    main: 'Main',
    side: 'Side',
    extra: 'Extra',
}

export const CATEGORY_CHIP: Record<PrepCategory, string> = {
    main: 'bg-coral-50 text-coral-700',
    side: 'bg-emerald-50 text-emerald-700',
    extra: 'bg-amber-50 text-amber-700',
}

export function CategoryChip({ category }: { category: PrepCategory }) {
    return (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_CHIP[category]}`}>
            {CATEGORY_LABEL[category]}
        </span>
    )
}

/** "412 kcal · P38 C20 F18" — the one-line macro read-out. */
export function MacroLine({ macros, className = '' }: { macros: Macros; className?: string }) {
    return (
        <span className={`tabular-nums ${className}`}>
            {kcal(macros.calories)} kcal · P{fmt(Math.round(macros.protein * 10) / 10)} C
            {fmt(Math.round(macros.carbs * 10) / 10)} F{fmt(Math.round(macros.fat * 10) / 10)}
        </span>
    )
}

/** A quiet marker that a figure is an estimate, with the reason on hover. */
export function EstimateBadge({ title }: { title: string }) {
    return (
        <span
            title={title}
            className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500"
        >
            est.
        </span>
    )
}

/** A compact numeric input with a trailing unit, for grams and the like. */
export function NumberField({
    label,
    value,
    onChange,
    unit = 'g',
    placeholder,
    error,
    autoFocus,
    ariaLabel,
    className = '',
}: {
    label?: ReactNode
    value: string
    onChange: (v: string) => void
    unit?: string
    placeholder?: string
    error?: string
    autoFocus?: boolean
    ariaLabel?: string
    className?: string
}) {
    return (
        <label className={`flex flex-col gap-1 ${className}`}>
            {label && <span className="text-xs font-semibold text-neutral-500">{label}</span>}
            <span
                className={`flex items-center rounded-xl border bg-neutral-50 pr-3 transition-colors focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-200 ${
                    error ? 'border-red-400' : 'border-neutral-200'
                }`}
            >
                <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={value}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    aria-label={ariaLabel}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full min-w-0 bg-transparent px-3 py-2 text-sm tabular-nums text-neutral-900 outline-none placeholder:text-neutral-300"
                />
                {unit && <span className="shrink-0 text-xs font-medium text-neutral-400">{unit}</span>}
            </span>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
        </label>
    )
}

/** Parse a form number: positive and finite, or undefined. */
export function positive(v: string): number | undefined {
    const n = Number(v)
    return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

/** Parse a form number: zero or more and finite, or undefined. */
export function nonNegative(v: string): number | undefined {
    const n = Number(v)
    return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
}

export interface OptionGroup {
    label: string
    options: { value: string; label: string; disabled?: boolean }[]
}

/**
 * A native select with option groups, styled like the app's inputs. Native on
 * purpose: it lives inside modals whose bodies clip overflow, where the custom
 * dropdown's panel would be cut off, and phones get their own picker for free.
 */
export function GroupedSelect({
    value,
    onChange,
    groups,
    placeholder,
    ariaLabel,
    error,
    className = '',
}: {
    value: string
    onChange: (v: string) => void
    groups: OptionGroup[]
    placeholder: string
    ariaLabel: string
    error?: boolean
    className?: string
}) {
    return (
        <select
            value={value}
            aria-label={ariaLabel}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full min-w-0 rounded-xl border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-200 ${
                error ? 'border-red-400' : 'border-neutral-200'
            } ${value ? '' : 'text-neutral-400'} ${className}`}
        >
            <option value="">{placeholder}</option>
            {groups
                .filter((g) => g.options.length > 0)
                .map((g) => (
                    <optgroup key={g.label} label={g.label}>
                        {g.options.map((o) => (
                            <option key={o.value} value={o.value} disabled={o.disabled}>
                                {o.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
        </select>
    )
}

/** A disclosure for optional fields — keeps the everyday form short. */
export function More({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
    return (
        <details open={defaultOpen} className="group rounded-xl border border-neutral-100 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-neutral-500">
                {label}
                <i className="fa-solid fa-chevron-down text-[10px] transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 flex flex-col gap-3">{children}</div>
        </details>
    )
}
