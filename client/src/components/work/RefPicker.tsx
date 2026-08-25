import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface RefOption {
    id: string
    label: string
    /** Secondary text — a person's role, a project's status. */
    hint?: string
    /** Full Tailwind background class for the leading dot, when the option has a colour. */
    dotClass?: string
}

interface RefPickerProps {
    options: RefOption[]
    value: string | null
    onChange: (id: string | null) => void
    /**
     * When given, a name that matches nothing can be created from the search
     * box. Returns the new option, or null if creating failed — the picker
     * stays open on a failure so the typing isn't lost.
     */
    onCreate?: (name: string) => Promise<RefOption | null>
    createLabel?: string
    /** Trigger text while nothing is selected. */
    placeholder?: string
    /** The "clear it" row's label, e.g. "No project". */
    clearLabel?: string
    icon?: string
    size?: 'sm' | 'md'
    align?: 'left' | 'right'
    disabled?: boolean
    className?: string
}

/**
 * A one-of picker for linking a task to a project or a person.
 *
 * Search, clear and create live in the same menu because the alternative — a
 * select plus a separate "manage" page — means leaving the task half-written to
 * go and add a colleague. Creating from the search box keeps capture in one
 * place, which is the only way the links actually get filled in.
 */
export default function RefPicker({
    options,
    value,
    onChange,
    onCreate,
    createLabel = 'Add',
    placeholder = 'Select',
    clearLabel = 'None',
    icon,
    size = 'md',
    align = 'left',
    disabled = false,
    className = '',
}: RefPickerProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [creating, setCreating] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    const selected = options.find((o) => o.id === value) ?? null

    useEffect(() => {
        if (!open) return
        function onPointerDown(event: MouseEvent) {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.stopPropagation()
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKey, true)
        // Land in the search box: with more than a handful of options, typing
        // is faster than reading the list.
        searchRef.current?.focus()
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKey, true)
        }
    }, [open])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    }, [options, query])

    const trimmed = query.trim()
    const canCreate =
        !!onCreate &&
        trimmed.length > 0 &&
        !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())

    function choose(id: string | null) {
        onChange(id)
        setOpen(false)
        setQuery('')
    }

    async function create() {
        if (!onCreate || !trimmed || creating) return
        setCreating(true)
        try {
            const created = await onCreate(trimmed)
            if (created) choose(created.id)
        } finally {
            setCreating(false)
        }
    }

    function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') return
        event.preventDefault()
        if (filtered.length > 0) choose(filtered[0].id)
        else if (canCreate) void create()
    }

    const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm'

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={[
                    'inline-flex max-w-full items-center gap-2 rounded-full border font-medium transition-colors duration-150',
                    sizeClasses,
                    selected
                        ? 'border-neutral-200 bg-white text-neutral-800'
                        : 'border-dashed border-neutral-300 bg-white text-neutral-400',
                    disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-neutral-400 hover:text-neutral-900',
                ].join(' ')}
            >
                {selected?.dotClass ? (
                    <span className={`h-2 w-2 shrink-0 rounded-full ${selected.dotClass}`} />
                ) : (
                    icon && <i className={`${icon} text-[11px] opacity-60`} aria-hidden="true" />
                )}
                <span className="truncate">{selected?.label ?? placeholder}</span>
            </button>

            {open && (
                <div
                    className={`absolute z-50 mt-1.5 max-h-72 w-64 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
                >
                    <div className="border-b border-neutral-100 p-2">
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onSearchKeyDown}
                            placeholder="Search…"
                            className="w-full rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-200"
                        />
                    </div>

                    <div className="max-h-52 overflow-y-auto p-1.5">
                        {value !== null && (
                            <button
                                type="button"
                                onClick={() => choose(null)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-500 transition-colors hover:bg-neutral-100"
                            >
                                <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
                                {clearLabel}
                            </button>
                        )}

                        {filtered.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => choose(option.id)}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-100 ${option.id === value ? 'bg-neutral-50 font-semibold text-neutral-900' : 'text-neutral-700'}`}
                            >
                                {option.dotClass && (
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${option.dotClass}`} />
                                )}
                                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                {option.hint && (
                                    <span className="shrink-0 text-xs text-neutral-400">{option.hint}</span>
                                )}
                            </button>
                        ))}

                        {filtered.length === 0 && !canCreate && (
                            <p className="px-3 py-4 text-center text-sm text-neutral-400">No matches</p>
                        )}

                        {canCreate && (
                            <button
                                type="button"
                                onClick={create}
                                disabled={creating}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                                <span className="min-w-0 truncate">
                                    {creating ? 'Adding…' : `${createLabel} “${trimmed}”`}
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
