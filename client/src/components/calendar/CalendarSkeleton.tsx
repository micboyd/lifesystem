import { Card } from '../Card'

/**
 * Placeholders shown while a calendar range loads (moving year/month, opening
 * past months). Shapes mirror the real Year panels and Month grid so nothing
 * jumps when the data lands; the shimmer comes from `.skeleton` in index.css.
 */

function Bone({ className = '' }: { className?: string }) {
    return <div aria-hidden="true" className={`skeleton ${className}`} />
}

const PART_ROWS = 4
const YEAR_DAYS = 31

/** One Year-view month panel: title, day header, part rows. */
function MonthPanelSkeleton() {
    return (
        <section className="bg-white px-5 pb-7 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
            <div className="flex items-center gap-5">
                <Bone className="h-8 w-48" />
                <Bone className="ml-auto h-4 w-16" />
            </div>
            <div className="mt-6 overflow-hidden">
                <div className="min-w-[60rem]">
                    <div className="flex items-end gap-1 border-b border-hairline pb-3 pt-2">
                        <div className="w-[104px] shrink-0 pr-3">
                            <Bone className="h-3 w-10" />
                        </div>
                        {Array.from({ length: YEAR_DAYS }, (_, i) => (
                            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                                <Bone className="h-2 w-4" />
                                <Bone className="h-5 w-5 rounded-full" />
                            </div>
                        ))}
                    </div>
                    {Array.from({ length: PART_ROWS }, (_, r) => (
                        <div key={r} className="flex items-center gap-1 border-b border-[#e4e4e4] py-1">
                            <div className="w-[104px] shrink-0 pr-3">
                                <Bone className="h-3.5 w-16" />
                            </div>
                            {Array.from({ length: YEAR_DAYS }, (_, d) => (
                                <div key={d} className="h-12 flex-1 p-0.5">
                                    {/* A scatter of "events" so it reads as a calendar, not a table. */}
                                    {(d * 7 + r * 3) % 9 === 0 && <Bone className="h-full w-full" />}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export function YearSkeleton({ months }: { months: number }) {
    // Two panels fill the screen; more would only add scroll to a placeholder.
    const count = Math.max(1, Math.min(months, 2))
    return (
        <div className="flex flex-col gap-6 pt-6" role="status" aria-label="Loading calendar">
            {Array.from({ length: count }, (_, i) => (
                <MonthPanelSkeleton key={i} />
            ))}
        </div>
    )
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MonthSkeleton() {
    return (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading calendar">
            <Bone className="mt-3 h-7 w-40" />
            <Card flush hover={false} className="overflow-hidden">
                <div className="grid grid-cols-7 border-b border-neutral-200 bg-white">
                    {WEEKDAY_HEADERS.map((d) => (
                        <div
                            key={d}
                            className="py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-300"
                        >
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 divide-x divide-y divide-neutral-100">
                    {Array.from({ length: 35 }, (_, i) => (
                        <div key={i} className="min-h-28 min-w-0 p-2 lg:aspect-square lg:min-h-0">
                            <div className="mb-2 flex justify-end">
                                <Bone className="h-6 w-6 rounded-full" />
                            </div>
                            {i % 3 !== 1 && <Bone className="mb-1 h-4 w-full" />}
                            {i % 4 === 0 && <Bone className="h-4 w-2/3" />}
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    )
}
