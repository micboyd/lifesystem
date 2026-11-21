import type { KeyboardEvent } from 'react'
import { buildPageItems, clampPage, type PageItem } from '../lib/pagination'

interface PaginationProps {
    page: number
    pageCount: number
    onChange: (page: number) => void
    /** Pages to show on each side of the current page from `sm` up. Default 1. Phones always use 0 so the bar fits on one line. */
    siblingCount?: number
    className?: string
}

// The narrowest phones (320px) need slightly slimmer slots for seven to fit in a row.
const SLOT = 'grid h-11 min-w-11 place-items-center text-sm transition-colors duration-150 max-[359px]:min-w-9 lg:h-10 lg:min-w-10'

export default function Pagination({
    page,
    pageCount,
    onChange,
    siblingCount = 1,
    className = '',
}: PaginationProps) {
    if (pageCount <= 1) return null

    const current = clampPage(page, pageCount)
    const go = (p: number) => {
        const next = clampPage(p, pageCount)
        if (next !== current) onChange(next)
    }

    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        const moves: Record<string, number> = {
            ArrowLeft: current - 1,
            ArrowRight: current + 1,
            Home: 1,
            End: pageCount,
        }
        if (!(e.key in moves)) return
        e.preventDefault()
        go(moves[e.key])
    }

    const arrowClass = (enabled: boolean) =>
        [
            SLOT,
            'border border-neutral-300',
            enabled
                ? 'text-neutral-600 hover:bg-neutral-50'
                : 'cursor-not-allowed text-neutral-300',
        ].join(' ')

    const renderItem = (item: PageItem) => {
        if (item.kind === 'gap') {
            const label = `Jump to page ${item.target}`
            return (
                <button
                    key={`gap-${item.side}`}
                    type="button"
                    aria-label={label}
                    title={label}
                    onClick={() => go(item.target)}
                    className={`${SLOT} group text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900`}
                >
                    <span className="group-hover:hidden group-focus-visible:hidden" aria-hidden="true">…</span>
                    <i
                        className={`fa-solid ${item.side === 'left' ? 'fa-angles-left' : 'fa-angles-right'} hidden text-xs group-hover:inline group-focus-visible:inline`}
                        aria-hidden="true"
                    />
                </button>
            )
        }
        const isCurrent = item.page === current
        return (
            <button
                key={item.page}
                type="button"
                aria-label={`Page ${item.page}`}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => go(item.page)}
                className={[
                    SLOT,
                    'px-2 font-medium tabular-nums',
                    isCurrent ? 'bg-neutral-900 text-neutral-50' : 'text-neutral-600 hover:bg-neutral-100',
                ].join(' ')}
            >
                {item.page}
            </button>
        )
    }

    return (
        <nav
            aria-label="Pagination"
            onKeyDown={onKeyDown}
            className={`flex items-center justify-center gap-1 sm:gap-1.5 ${className}`}
        >
            <button
                type="button"
                aria-label="Previous page"
                disabled={current <= 1}
                onClick={() => go(current - 1)}
                className={arrowClass(current > 1)}
            >
                <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
            </button>

            {/* Phones: no siblings, so seven slots fit a 375px screen without wrapping. */}
            <div className="contents sm:hidden">{buildPageItems(current, pageCount, 0).map(renderItem)}</div>
            <div className="hidden sm:contents">
                {buildPageItems(current, pageCount, siblingCount).map(renderItem)}
            </div>

            <button
                type="button"
                aria-label="Next page"
                disabled={current >= pageCount}
                onClick={() => go(current + 1)}
                className={arrowClass(current < pageCount)}
            >
                <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
            </button>
        </nav>
    )
}
