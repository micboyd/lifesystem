import { useEffect, useRef, useState } from 'react'

/** Slide a tab row sideways so its current tab is in view, without moving the page. */
export function revealActive(row: HTMLElement | null, active: HTMLElement | null) {
    if (!row || !active || row.scrollWidth <= row.clientWidth) return
    const left = active.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft
    if (left < row.scrollLeft || left + active.offsetWidth > row.scrollLeft + row.clientWidth) {
        row.scrollLeft = Math.max(0, left - (row.clientWidth - active.offsetWidth) / 2)
    }
}

interface TabsProps {
    tabs: string[]
    value?: string
    defaultTab?: string
    onChange?: (tab: string) => void
    className?: string
}

export default function Tabs({ tabs, value, defaultTab, onChange, className = '' }: TabsProps) {
    const isControlled = value !== undefined
    const [internal, setInternal] = useState(defaultTab ?? tabs[0])
    const active = isControlled ? value : internal
    const rowRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        revealActive(rowRef.current, rowRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null)
    }, [active])

    function select(tab: string) {
        if (!isControlled) setInternal(tab)
        onChange?.(tab)
    }

    // Open and editorial: plain text links on a hairline, the current one underlined.
    return (
        <div
            ref={rowRef}
            role="tablist"
            className={`flex max-w-full gap-6 overflow-x-auto scrollbar-none border-b border-hairline ${className}`}
        >
            {tabs.map((tab) => {
                const selected = tab === active
                return (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => select(tab)}
                        className={[
                            'h-10 shrink-0 whitespace-nowrap text-sm font-medium transition-colors duration-150',
                            selected
                                ? 'text-neutral-900 shadow-[inset_0_-2px_0_var(--color-ink)]'
                                : 'text-neutral-500 hover:text-neutral-900',
                        ].join(' ')}
                    >
                        {tab}
                    </button>
                )
            })}
        </div>
    )
}
