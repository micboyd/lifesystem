import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MenuItem } from './DropdownMenu'

interface ContextMenuProps {
    /** Viewport coordinates of the originating right-click. */
    x: number
    y: number
    items: MenuItem[]
    onClose: () => void
}

/**
 * A right-click menu anchored to the cursor. Rendered in a portal, positioned
 * with `fixed` coordinates and nudged back inside the viewport if it would
 * overflow. Closes on outside click, scroll, resize, or Escape.
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({ left: x, top: y })

    useEffect(() => {
        function close() {
            onClose()
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        // Capture-phase scroll so it fires for any scrolling ancestor.
        window.addEventListener('mousedown', close)
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', close)
            window.removeEventListener('scroll', close, true)
            window.removeEventListener('resize', close)
            window.removeEventListener('keydown', onKey)
        }
    }, [onClose])

    // Keep the menu on-screen once we know its real size.
    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const { width, height } = el.getBoundingClientRect()
        const margin = 8
        setPos({
            left: Math.min(x, window.innerWidth - width - margin),
            top: Math.min(y, window.innerHeight - height - margin),
        })
    }, [x, y, items.length])

    return createPortal(
        <div
            ref={ref}
            role="menu"
            style={{ left: pos.left, top: pos.top }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className="fixed z-[100] min-w-44 rounded-xl border border-neutral-100 bg-white p-1.5 shadow-lg"
        >
            {items.map((item) => (
                <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                        item.onClick?.()
                        onClose()
                    }}
                    className={[
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-100',
                        item.danger
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-neutral-700 hover:bg-neutral-100',
                    ].join(' ')}
                >
                    {item.icon && (
                        <i
                            className={`${item.icon} w-4 text-center text-xs ${item.danger ? 'text-red-500' : 'text-neutral-400'}`}
                            aria-hidden="true"
                        />
                    )}
                    {item.label}
                </button>
            ))}
        </div>,
        document.body
    )
}
