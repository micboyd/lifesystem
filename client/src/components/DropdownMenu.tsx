import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface MenuItem {
    label: string
    icon?: string
    onClick?: () => void
    href?: string
    danger?: boolean
}

export type MenuEntry = MenuItem | 'divider'

type DropdownSize = 'small' | 'medium' | 'large'

const SIZE_WIDTH: Record<DropdownSize, string> = {
    small: 'min-w-44',
    medium: 'min-w-56',
    large: 'min-w-72',
}

interface DropdownMenuProps {
    trigger: ReactNode
    items: MenuEntry[]
    align?: 'left' | 'right'
    size?: DropdownSize
    className?: string
}

export default function DropdownMenu({
    trigger,
    items,
    align = 'left',
    size = 'small',
    className = '',
}: DropdownMenuProps) {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    // Horizontal nudge that pulls the menu back inside the viewport on narrow
    // screens, where a wide menu on an edge-anchored trigger would overflow.
    const [shift, setShift] = useState(0)

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

    // Measure once the menu is up, then shift it just enough to fit.
    useLayoutEffect(() => {
        // No reset on close: the menu unmounts, and the measurement below
        // subtracts any carried-over shift, so a stale value self-corrects
        // before the next paint.
        const el = menuRef.current
        if (!open || !el) return
        const margin = 8
        // Measure against the unshifted position so the correction is absolute.
        const rect = el.getBoundingClientRect()
        const left = rect.left - shift
        const right = rect.right - shift
        if (right > window.innerWidth - margin) {
            setShift(Math.max(window.innerWidth - margin - right, margin - left))
        } else if (left < margin) {
            setShift(margin - left)
        } else {
            setShift(0)
        }
        // `shift` is deliberately excluded: including it would re-run on every
        // correction and oscillate.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, items.length, align, size])

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
                    ref={menuRef}
                    role="menu"
                    style={shift ? { transform: `translateX(${shift}px)` } : undefined}
                    className={`absolute z-50 mt-2 ${SIZE_WIDTH[size]} max-w-[calc(100vw-1rem)] rounded-xl border border-neutral-100 bg-white p-1.5 shadow-lg ${
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
