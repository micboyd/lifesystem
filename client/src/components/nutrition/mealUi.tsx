import type { BoxPart, Macros, MealType } from '../../types'
import { fmt } from './format'

/**
 * The look shared by everything that shows a meal: a colour and icon per meal
 * of the day, and a bar showing where the calories come from.
 */

export const CATEGORY: Record<
    MealType,
    { label: string; icon: string; tile: string; text: string; solid: string; ring: string }
> = {
    breakfast: {
        label: 'Breakfast',
        icon: 'fa-solid fa-mug-hot',
        tile: 'bg-marigold-50',
        text: 'text-amber-700',
        solid: 'bg-marigold',
        ring: 'ring-marigold-200',
    },
    lunch: {
        label: 'Lunch',
        icon: 'fa-solid fa-bowl-food',
        tile: 'bg-brand-50',
        text: 'text-brand-600',
        solid: 'bg-brand-500',
        ring: 'ring-brand-100',
    },
    dinner: {
        label: 'Dinner',
        icon: 'fa-solid fa-utensils',
        tile: 'bg-coral-50',
        text: 'text-coral-600',
        solid: 'bg-coral-500',
        ring: 'ring-coral-200',
    },
    snack: {
        label: 'Snacks',
        icon: 'fa-solid fa-apple-whole',
        tile: 'bg-emerald-50',
        text: 'text-emerald-700',
        solid: 'bg-emerald-500',
        ring: 'ring-emerald-100',
    },
}

const MACRO_STYLE = {
    protein: { label: 'protein', bar: 'bg-brand-600', dot: 'bg-brand-600' },
    carbs: { label: 'carbs', bar: 'bg-marigold', dot: 'bg-marigold' },
    fat: { label: 'fat', bar: 'bg-coral-300', dot: 'bg-coral-300' },
} as const

/** Calories implied by the macros (4 / 4 / 9). */
export function caloriesFromMacros(m: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
    return Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9)
}

/** At least 30% of calories from protein — the meals that carry a cut. */
export function isHighProtein(m: Macros): boolean {
    return m.calories > 0 && (m.protein * 4) / m.calories >= 0.3
}

/** The meal-of-the-day icon in its coloured tile. */
export function CategoryIcon({ type, size = 'md' }: { type: MealType; size?: 'sm' | 'md' | 'lg' }) {
    const c = CATEGORY[type]
    const box = size === 'sm' ? 'h-7 w-7 text-[11px] rounded-lg' : size === 'lg' ? 'h-12 w-12 text-lg rounded-2xl' : 'h-9 w-9 text-sm rounded-xl'
    return (
        <span className={`grid shrink-0 place-items-center ${box} ${c.tile} ${c.text}`} aria-hidden="true">
            <i className={c.icon} />
        </span>
    )
}

/**
 * Protein, carbs and fat as shares of the meal's calories — so a lean plate
 * and a heavy one look different before any number is read.
 */
export function MacroBar({ macros, thick = false }: { macros: Macros; thick?: boolean }) {
    const parts = [
        { key: 'protein' as const, kcal: macros.protein * 4 },
        { key: 'carbs' as const, kcal: macros.carbs * 4 },
        { key: 'fat' as const, kcal: macros.fat * 9 },
    ]
    const total = parts.reduce((a, p) => a + p.kcal, 0)
    return (
        <div
            className={`flex w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100 ${thick ? 'h-2.5' : 'h-1.5'}`}
            role="img"
            aria-label={`Protein ${fmt(macros.protein)} g, carbs ${fmt(macros.carbs)} g, fat ${fmt(macros.fat)} g`}
        >
            {total > 0 &&
                parts.map((p) =>
                    p.kcal > 0 ? (
                        <span
                            key={p.key}
                            className={`h-full ${MACRO_STYLE[p.key].bar} transition-[width] duration-300`}
                            style={{ width: `${(p.kcal / total) * 100}%` }}
                        />
                    ) : null
                )}
        </div>
    )
}

/** "● 45 g protein ● 60 g carbs ● 12 g fat" under a macro bar. */
export function MacroLegend({ macros, compact = false }: { macros: Macros; compact?: boolean }) {
    return (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-neutral-500 ${compact ? 'text-[11px]' : 'text-xs'}`}>
            {(['protein', 'carbs', 'fat'] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${MACRO_STYLE[k].dot}`} aria-hidden="true" />
                    <span className="font-semibold text-neutral-800">{fmt(Math.round(macros[k]))} g</span>
                    {!compact && MACRO_STYLE[k].label}
                    {compact && MACRO_STYLE[k].label[0].toUpperCase()}
                </span>
            ))}
        </div>
    )
}

export const MACRO_DOT = {
    protein: MACRO_STYLE.protein.dot,
    carbs: MACRO_STYLE.carbs.dot,
    fat: MACRO_STYLE.fat.dot,
}

/** What to weigh into one box, part by part, biggest numbers first in the eye line. */
export function BoxParts({ parts, weighHint }: { parts: BoxPart[]; weighHint?: string }) {
    const total = parts.reduce((a, p) => a + p.grams, 0)
    const approx = parts.some((p) => p.approx)
    return (
        <section className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">In each box</p>
            <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                {parts.map((p, n) => (
                    <li key={n} className="flex items-baseline gap-3 px-4 py-3">
                        <span className="w-20 shrink-0 text-right text-lg font-semibold tabular-nums text-neutral-950">
                            {p.approx ? '~' : ''}
                            {fmt(p.grams)} g
                        </span>
                        <span className="min-w-0 text-sm text-neutral-800">{p.name}</span>
                    </li>
                ))}
                {parts.length > 1 && (
                    <li className="flex items-baseline gap-3 bg-neutral-50 px-4 py-2.5">
                        <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-neutral-600">
                            {approx ? '~' : ''}
                            {fmt(total)} g
                        </span>
                        <span className="text-xs text-neutral-500">the whole box</span>
                    </li>
                )}
            </ul>
            {approx && (
                <p className="text-xs text-neutral-500">
                    {weighHint ??
                        '~ is an estimate from the raw weights. Weigh the cooked tray once, divide by the boxes, and put the real figure in with Edit.'}
                </p>
            )}
        </section>
    )
}
