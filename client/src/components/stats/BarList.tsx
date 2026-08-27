/**
 * A ranked list of horizontal bars — muscle groups by volume, conditioning
 * categories by minutes. Bars are scaled against the biggest item rather than
 * the total, so the smallest slice still has a visible bar instead of a smear.
 */
export interface BarItem {
    key: string
    label: string
    /** What the bar is scaled by. */
    value: number
    /** The figure shown on the right, already formatted. */
    valueLabel: string
    /** Draw this one in grey — a residual bucket rather than a real category. */
    muted?: boolean
}

export default function BarList({ items }: { items: BarItem[] }) {
    const max = Math.max(...items.map((i) => i.value), 1)

    return (
        <div className="flex flex-col gap-2.5">
            {items.map((item) => (
                <div key={item.key} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span
                            className={`min-w-0 truncate font-semibold ${
                                item.muted ? 'text-neutral-400' : 'text-neutral-700'
                            }`}
                        >
                            {item.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-neutral-400">
                            {item.valueLabel}
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div
                            className={`h-full rounded-full ${
                                item.muted ? 'bg-neutral-300' : 'bg-coral-500'
                            }`}
                            style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}
