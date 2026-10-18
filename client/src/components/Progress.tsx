type ProgressVariant = 'default' | 'success'

interface ProgressProps {
    value: number
    variant?: ProgressVariant
    showLabel?: boolean
    className?: string
}

const barClasses: Record<ProgressVariant, string> = {
    default: 'bg-neutral-900',
    success: 'bg-success',
}

export default function Progress({
    value,
    variant = 'default',
    showLabel = false,
    className = '',
}: ProgressProps) {
    const clamped = Math.max(0, Math.min(100, value))

    return (
        <div className={className}>
            {showLabel && (
                <div className="mb-2 flex items-center justify-between text-[13px] text-neutral-600">
                    <span>Progress</span>
                    <span className="tabular-nums text-neutral-600">
                        {Math.round(clamped)}%
                    </span>
                </div>
            )}
            <div
                className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
                role="progressbar"
                aria-valuenow={Math.round(clamped)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={`h-full rounded-full transition-all duration-500 ${barClasses[variant]}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
        </div>
    )
}
