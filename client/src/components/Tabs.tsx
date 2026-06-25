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
        <div className={`inline-flex gap-1 rounded-full bg-neutral-100 p-1 ${className}`}>
            {tabs.map((tab) => {
                const selected = tab === active
                return (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => select(tab)}
                        className={[
                            'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 whitespace-nowrap',
                            selected
                                ? 'bg-white text-neutral-900 shadow-sm'
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
