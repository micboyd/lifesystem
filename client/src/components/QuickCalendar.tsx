import { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CalendarBody } from '../pages/Calendar'
import { useOverlayBehavior } from './useOverlay'
import { OverlayCloseButton } from './overlayParts'

/**
 * The calendar over whatever page you're on: the same Year/Month views,
 * birthday drawer and export as /calendar, without leaving the page. Sits
 * above the top bar (z-40) and below drawers and modals (z-50), so the
 * calendar's own drawers open on top of it. Escape closes it only when none of
 * those is open; otherwise Escape closes the drawer first.
 */
export default function QuickCalendar({ open, onClose }: { open: boolean; onClose: () => void }) {
    const closeIfTopmost = useCallback(() => {
        const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])')
        if (dialogs.length <= 1) onClose()
    }, [onClose])
    useOverlayBehavior(open, closeIfTopmost)

    if (!open) return null

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Quick calendar"
            className="fixed inset-0 z-[45] flex flex-col bg-white"
        >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-900 pl-5 pr-2 pt-[env(safe-area-inset-top)] sm:pl-10 sm:pr-8">
                <span className="label-caps text-neutral-600">Quick calendar</span>
                <Link
                    to="/calendar"
                    onClick={onClose}
                    className="ml-auto text-[13px] text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
                >
                    Open full page
                </Link>
                <OverlayCloseButton onClose={onClose} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                <CalendarBody embedded />
            </div>
        </div>,
        document.body
    )
}
