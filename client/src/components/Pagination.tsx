interface PaginationProps {
    page: number
    pageCount: number
    onChange: (page: number) => void
    /** Pages to show on each side of the current page. Default 1. */
    siblingCount?: number
    className?: string
}

type PageItem = number | 'ellipsis'

function buildPages(page: number, pageCount: number, siblingCount: number): PageItem[] {
    // Show first, last, current ± siblings; collapse gaps with an ellipsis.
    const totalShown = siblingCount * 2 + 5 // first, last, current, 2 ellipses
    if (pageCount <= totalShown) {
        return Array.from({ length: pageCount }, (_, i) => i + 1)
    }

    const left = Math.max(page - siblingCount, 1)
    const right = Math.min(page + siblingCount, pageCount)
    const showLeftEllipsis = left > 2
    const showRightEllipsis = right < pageCount - 1

    const pages: PageItem[] = [1]
    if (showLeftEllipsis) pages.push('ellipsis')
    for (let p = showLeftEllipsis ? left : 2; p <= (showRightEllipsis ? right : pageCount - 1); p++) {
        pages.push(p)
    }
    if (showRightEllipsis) pages.push('ellipsis')
    pages.push(pageCount)
    return pages
}

export default function Pagination({
    page,
    pageCount,
    onChange,
    siblingCount = 1,
    className = '',
}: PaginationProps) {
    if (pageCount <= 1) return null

    const pages = buildPages(page, pageCount, siblingCount)

    const arrowClass = (enabled: boolean) =>
        [
            'grid h-9 w-9 place-items-center rounded-full border border-neutral-200 text-sm transition-colors duration-150',
            enabled
                ? 'text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                : 'cursor-not-allowed text-neutral-300',
        ].join(' ')

    return (
        <nav aria-label="Pagination" className={`flex items-center gap-1.5 ${className}`}>
            <button
                type="button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => onChange(page - 1)}
                className={arrowClass(page > 1)}
            >
                <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
            </button>

            {pages.map((p, i) =>
                p === 'ellipsis' ? (
                    <span
                        key={`ellipsis-${i}`}
                        className="grid h-9 w-9 place-items-center text-sm text-neutral-400"
                    >
                        …
                    </span>
                ) : (
                    <button
                        key={p}
                        type="button"
                        aria-current={p === page ? 'page' : undefined}
                        onClick={() => onChange(p)}
                        className={[
                            'grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-semibold tabular-nums transition-colors duration-150',
                            p === page
                                ? 'bg-neutral-950 text-white'
                                : 'text-neutral-600 hover:bg-neutral-100',
                        ].join(' ')}
                    >
                        {p}
                    </button>
                ),
            )}

            <button
                type="button"
                aria-label="Next page"
                disabled={page >= pageCount}
                onClick={() => onChange(page + 1)}
                className={arrowClass(page < pageCount)}
            >
                <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
            </button>
        </nav>
    )
}
