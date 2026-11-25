import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MenuEntry } from './DropdownMenu'

interface ContextMenuProps {
    /** Viewport coordinates of the originating right-click. */
    x: number
    y: number
    /** Menu items; 'divider' draws a hairline between groups. */
    items: MenuEntry[]
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
    // Parents pass a fresh onClose each render; read it through a ref so the
    // listeners (and the scroll grace period below) are set up once per open.
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    useEffect(() => {
        const onClose = () => onCloseRef.current()
        const openedAt = performance.now()
        function close() {
            onClose()
        }
        // A trackpad two-finger tap (the Mac right-click) often nudges a
        // sideways-scrolling grid by a pixel or two as the menu opens; ignore
        // scrolls in that first moment so the menu doesn't vanish instantly.
        function onScroll() {
            if (performance.now() - openedAt < 400) return
            onClose()
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        // Capture-phase scroll so it fires for any scrolling ancestor.
        window.addEventListener('mousedown', close)
        window.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', close)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', close)
            window.removeEventListener('scroll', onScroll, true)
            window.removeEventListener('resize', close)
            window.removeEventListener('keydown', onKey)
        }
    }, [])

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
            className="fixed z-[100] min-w-48 rounded-xl bg-white p-1 shadow-lg ring-1 ring-hairline"
        >
            {items.map((item, i) =>
                item === 'divider' ? (
                    <div key={`divider-${i}`} className="my-1 h-px bg-hairline" role="separator" />
                ) : (
                    <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            item.onClick?.()
                            onClose()
                        }}
                        className={[
                            'flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-100',
                            item.danger
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-neutral-700 hover:bg-neutral-100',
                        ].join(' ')}
                    >
                        {item.icon && (
                            <i
                                className={`${item.icon} w-4 text-center text-xs ${item.danger ? 'text-red-500' : 'text-neutral-500'}`}
                                aria-hidden="true"
                            />
                        )}
                        {item.label}
                    </button>
                )
            )}
        </div>,
        document.body
    )
}
