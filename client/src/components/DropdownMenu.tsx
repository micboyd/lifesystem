import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface MenuItem {
    label: string
    icon?: string
    onClick?: () => void
    href?: string
    danger?: boolean
}

export type MenuEntry = MenuItem | 'divider'

interface DropdownMenuProps {
    trigger: ReactNode
    items: MenuEntry[]
    align?: 'left' | 'right'
    className?: string
}

export default function DropdownMenu({
    trigger,
    items,
    align = 'left',
    className = '',
}: DropdownMenuProps) {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function handle(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    const itemClass = (danger?: boolean) =>
        [
            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-100',
            danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-700 hover:bg-neutral-100',
        ].join(' ')

    return (
        <div ref={containerRef} className={`relative inline-block ${className}`}>
            <div onClick={() => setOpen((o) => !o)} className="inline-flex">
                {trigger}
            </div>

            {open && (
                <div
                    role="menu"
                    className={`absolute z-50 mt-2 min-w-44 rounded-xl border border-neutral-100 bg-white p-1.5 shadow-lg ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    {items.map((item, i) => {
                        if (item === 'divider') {
                            return <div key={`divider-${i}`} className="my-1 h-px bg-neutral-100" />
                        }
                        const inner = (
                            <>
                                {item.icon && (
                                    <i
                                        className={`${item.icon} w-4 text-center text-xs ${item.danger ? 'text-red-500' : 'text-neutral-400'}`}
                                        aria-hidden="true"
                                    />
                                )}
                                {item.label}
                            </>
                        )
                        if (item.href) {
                            return (
                                <Link
                                    key={item.label}
                                    to={item.href}
                                    role="menuitem"
                                    onClick={() => setOpen(false)}
                                    className={itemClass(item.danger)}
                                >
                                    {inner}
                                </Link>
                            )
                        }
                        return (
                            <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    item.onClick?.()
                                    setOpen(false)
                                }}
                                className={itemClass(item.danger)}
                            >
                                {inner}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
