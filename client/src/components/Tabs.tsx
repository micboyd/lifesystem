import { useState } from 'react'

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

    function select(tab: string) {
        if (!isControlled) setInternal(tab)
        onChange?.(tab)
    }

    return (
        <div
            className={`inline-flex max-w-full gap-1 overflow-x-auto scrollbar-none rounded-xl bg-neutral-100 p-1 ${className}`}
        >
            {tabs.map((tab) => {
                const selected = tab === active
                return (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => select(tab)}
                        className={[
                            'h-9 rounded-[9px] px-4 text-[13px] font-medium transition-all duration-200 whitespace-nowrap',
                            selected
                                ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.04]'
                                : 'text-neutral-600 hover:text-neutral-900',
                        ].join(' ')}
                    >
                        {tab}
                    </button>
                )
            })}
        </div>
    )
}
