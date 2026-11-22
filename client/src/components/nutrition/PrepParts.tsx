import { useMemo, useState, type ReactNode } from 'react'
import BottomSheet from '../BottomSheet'
import Input from '../Input'
import { CAPS, DoneTick, Eyebrow, SectionTitle } from '../Blok'
import { CategoryIcon } from './mealUi'
import { plural } from './ShoppingList'
import type { Meal } from '../../types'

/** Prep's building blocks: the count stepper, the meal picker, the step rail and heads. */

export const ICON_BTN =
    'grid h-11 w-11 shrink-0 place-items-center text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 lg:h-10 lg:w-10'

/** − n + with the number typeable. At one, the minus takes it off. */
export function CountStepper({
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

/** The meal picker: search the library, tap one to add it. */
export function MealPicker({
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
        <BottomSheet open={open} onClose={close} title="Add a meal by hand">
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

/** Days · Shop · Cook across the top: number (or tick), name, where it stands. */
export function StepRail<S extends string>({
    step,
    onStep,
    steps,
}: {
    step: S
    onStep: (s: S) => void
    steps: { key: S; label: string; status: string; done: boolean }[]
}) {
    return (
        <nav aria-label="Prep steps" className="grid grid-cols-3 border-b border-hairline">
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
export function StepHead({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
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
