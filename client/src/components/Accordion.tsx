import { useState, type ReactNode } from 'react'

export interface AccordionItem {
    title: string
    content: ReactNode
}

interface AccordionProps {
    items: AccordionItem[]
    allowMultiple?: boolean
    defaultOpen?: number | number[]
    className?: string
}

export default function Accordion({
    items,
    allowMultiple = false,
    defaultOpen,
    className = '',
}: AccordionProps) {
    const initial =
        defaultOpen === undefined ? [] : Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen]
    const [openIndexes, setOpenIndexes] = useState<number[]>(initial)

    function toggle(index: number) {
        setOpenIndexes((prev) => {
            const isOpen = prev.includes(index)
            if (allowMultiple) {
                return isOpen ? prev.filter((i) => i !== index) : [...prev, index]
            }
            return isOpen ? [] : [index]
        })
    }

    return (
        <div className={`divide-y divide-neutral-100 rounded-2xl border border-neutral-100 ${className}`}>
            {items.map((item, i) => {
                const isOpen = openIndexes.includes(i)
                return (
                    <div key={`${item.title}-${i}`}>
                        <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => toggle(i)}
                            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-neutral-900 transition-colors duration-150 hover:bg-neutral-50"
                        >
                            {item.title}
                            <i
                                className={`fa-solid fa-chevron-down shrink-0 text-xs text-neutral-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                            />
                        </button>
                        <div
                            className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                        >
                            <div className="overflow-hidden">
                                <div className="px-5 pb-4 text-sm leading-relaxed text-neutral-500">
                                    {item.content}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
