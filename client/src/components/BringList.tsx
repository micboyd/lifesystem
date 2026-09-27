import { useEffect, useState } from 'react'

/**
 * A workout's "what to bring" — the kit you pack from home. Shown as a packing
 * checklist before you set off, as a reminder while you log, and edited as
 * chips in the workout builder.
 */

/** Common kit, offered as one-tap suggestions in the builder. */
const SUGGESTIONS = [
    'Lifting belt',
    'Lifting straps',
    'Wrist wraps',
    'Knee sleeves',
    'Resistance band',
    'Neck harness',
    'Chalk',
    'Towel',
    'Water bottle',
    'Headphones',
]

const KEY_PREFIX = 'packed:'
/** A packing list ticked yesterday doesn't count for today. */
const TTL_MS = 24 * 60 * 60 * 1000

function readPacked(key: string): string[] {
    try {
        const raw = localStorage.getItem(KEY_PREFIX + key)
        if (!raw) return []
        const parsed = JSON.parse(raw) as { items?: unknown; savedAt?: unknown }
        if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > TTL_MS) return []
        return Array.isArray(parsed.items)
            ? parsed.items.filter((x): x is string => typeof x === 'string')
            : []
    } catch {
        return []
    }
}

function writePacked(key: string, items: string[]): void {
    try {
        localStorage.setItem(KEY_PREFIX + key, JSON.stringify({ items, savedAt: Date.now() }))
    } catch {
        /* best-effort */
    }
}

/**
 * The packing checklist — big rows to tick off as each thing goes in the bag.
 * Ticks are kept on the device under `packKey` (e.g. the planned session), so
 * packing the night before still shows in the morning. Nothing when the
 * workout needs no kit.
 */
export function BringChecklist({ items, packKey }: { items?: string[]; packKey: string }) {
    const [packed, setPacked] = useState<string[]>(() => readPacked(packKey))
    useEffect(() => {
        setPacked(readPacked(packKey))
    }, [packKey])

    if (!items?.length) return null
    const done = items.filter((i) => packed.includes(i)).length
    const all = done === items.length

    function toggle(item: string) {
        const next = packed.includes(item) ? packed.filter((p) => p !== item) : [...packed, item]
        setPacked(next)
        writePacked(packKey, next)
    }

    return (
        <section
            className={`rounded-2xl border p-3 ${all ? 'border-emerald-200 bg-emerald-50/40' : 'border-neutral-200'}`}
        >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="inline-flex items-center gap-2 text-sm font-bold text-neutral-900">
                    <i
                        className={`fa-solid fa-bag-shopping ${all ? 'text-emerald-600' : 'text-neutral-400'}`}
                        aria-hidden="true"
                    />
                    What to bring
                </p>
                <span
                    className={`text-xs font-semibold tabular-nums ${all ? 'text-emerald-700' : 'text-neutral-400'}`}
                >
                    {all ? 'All packed' : `${done}/${items.length} packed`}
                </span>
            </div>
            <ul className="flex flex-col gap-1">
                {items.map((item) => {
                    const on = packed.includes(item)
                    return (
                        <li key={item}>
                            <button
                                type="button"
                                onClick={() => toggle(item)}
                                aria-pressed={on}
                                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                            >
                                <span
                                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors ${
                                        on
                                            ? 'border-emerald-500 bg-emerald-500 text-white'
                                            : 'border-neutral-300 text-transparent'
                                    }`}
                                >
                                    <i className="fa-solid fa-check text-[11px]" aria-hidden="true" />
                                </span>
                                <span
                                    className={
                                        on ? 'text-neutral-400 line-through' : 'text-neutral-800'
                                    }
                                >
                                    {item}
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

/** The kit as a row of small chips — a reminder, not a checklist. */
export function BringChips({ items }: { items?: string[] }) {
    if (!items?.length) return null
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <i className="fa-solid fa-bag-shopping text-[11px]" aria-hidden="true" />
                Bring
            </span>
            {items.map((item) => (
                <span
                    key={item}
                    className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
                >
                    {item}
                </span>
            ))}
        </div>
    )
}

/**
 * Edit the list: chips with a remove button, a box to type another (Enter or a
 * comma adds it), and one-tap suggestions for common kit.
 */
export function BringInput({
    value,
    onChange,
}: {
    value: string[]
    onChange: (next: string[]) => void
}) {
    const [draft, setDraft] = useState('')
    const has = (item: string) => value.some((v) => v.toLowerCase() === item.toLowerCase())

    function add(raw: string) {
        const items = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        const next = [...value]
        for (const item of items) if (!next.some((v) => v.toLowerCase() === item.toLowerCase())) next.push(item)
        onChange(next)
        setDraft('')
    }

    const suggestions = SUGGESTIONS.filter((s) => !has(s))

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3">
            <div>
                <p className="text-sm font-semibold text-neutral-900">What to bring</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                    Kit to pack from home. Tick it off before you leave.
                </p>
            </div>

            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((item) => (
                        <span
                            key={item}
                            className="inline-flex items-center gap-1 rounded-full bg-neutral-900 py-1 pl-3 pr-1 text-xs font-medium text-white"
                        >
                            {item}
                            <button
                                type="button"
                                aria-label={`Remove ${item}`}
                                onClick={() => onChange(value.filter((v) => v !== item))}
                                className="grid h-6 w-6 place-items-center rounded-full text-neutral-300 hover:bg-white/10 hover:text-white"
                            >
                                <i className="fa-solid fa-xmark text-[10px]" aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="flex gap-2">
                <input
                    value={draft}
                    onChange={(e) => {
                        const v = e.target.value
                        if (v.includes(',')) add(v)
                        else setDraft(v)
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            if (draft.trim()) add(draft)
                        }
                    }}
                    placeholder="e.g. Lifting belt"
                    aria-label="Add something to bring"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base outline-none placeholder:text-neutral-400 focus:border-neutral-400 sm:text-sm"
                />
                <button
                    type="button"
                    onClick={() => draft.trim() && add(draft)}
                    disabled={!draft.trim()}
                    className="h-10 shrink-0 rounded-lg bg-neutral-100 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-40"
                >
                    Add
                </button>
            </div>

            {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => add(s)}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-800"
                        >
                            <i className="fa-solid fa-plus text-[9px]" aria-hidden="true" />
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
