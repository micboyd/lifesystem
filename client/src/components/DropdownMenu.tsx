import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
    // Fixed-viewport coordinates for the portaled menu. It renders on <body> so
    // no ancestor's overflow or stacking context can clip it or cover it.
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    useEffect(() => {
        if (!open) return
        function handle(event: MouseEvent) {
            const target = event.target as Node
            if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return
            setOpen(false)
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', handle)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', handle)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    // Pin the menu to its trigger: below it, flipped above when there's no room,
    // and nudged sideways to stay on screen. Re-run as anything scrolls.
    useLayoutEffect(() => {
        if (!open) return
        function place() {
            const trigger = containerRef.current
            const menu = menuRef.current
            if (!trigger || !menu) return
            const rect = trigger.getBoundingClientRect()
            const gap = 8
            const margin = 8
            const width = menu.offsetWidth
            const height = menu.offsetHeight

            let left = align === 'right' ? rect.right - width : rect.left
            left = Math.min(left, window.innerWidth - margin - width)
            left = Math.max(left, margin)

            let top = rect.bottom + gap
            if (top + height > window.innerHeight - margin && rect.top - gap - height > margin) {
                top = rect.top - gap - height
            }
            setPos({ top, left })
        }
        place()
        window.addEventListener('scroll', place, true)
        window.addEventListener('resize', place)
        return () => {
            window.removeEventListener('scroll', place, true)
            window.removeEventListener('resize', place)
        }
    }, [open, items.length, align, size])

    const itemClass = (danger?: boolean) =>
        [
            'flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition-colors duration-100',
            danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-700 hover:bg-neutral-100',
        ].join(' ')

    return (
        <div ref={containerRef} className={`relative inline-block ${className}`}>
            <div onClick={() => setOpen((o) => !o)} className="inline-flex">
                {trigger}
            </div>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        // Hidden until measured, so it never flashes at the origin.
                        style={{
                            position: 'fixed',
                            top: pos?.top ?? 0,
                            left: pos?.left ?? 0,
                            visibility: pos ? 'visible' : 'hidden',
                        }}
                        className={`z-[100] ${SIZE_WIDTH[size]} max-w-[calc(100vw-1rem)] rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-neutral-900/[0.06]`}
                    >
                        {items.map((item, i) => {
                            if (item === 'divider') {
                                return (
                                    <div
                                        key={`divider-${i}`}
                                        className="my-1 h-px bg-neutral-100"
                                    />
                                )
                            }
                            const inner = (
                                <>
                                    {item.icon && (
                                        <i
                                            className={`${item.icon} w-4 text-center text-xs ${item.danger ? 'text-red-500' : 'text-neutral-500'}`}
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
                                        setOpen(false)
                                        item.onClick?.()
                                    }}
                                    className={itemClass(item.danger)}
                                >
                                    {inner}
                                </button>
                            )
                        })}
                    </div>,
                    document.body
                )}
        </div>
    )
}
