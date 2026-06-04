import { useState } from 'react'

type RatingSize = 'sm' | 'md' | 'lg'

interface RatingProps {
    value?: number
    defaultValue?: number
    onChange?: (value: number) => void
    max?: number
    readOnly?: boolean
    size?: RatingSize
    className?: string
}

const sizeClasses: Record<RatingSize, string> = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
}

export default function Rating({
    value,
    defaultValue,
    onChange,
    max = 5,
    readOnly = false,
    size = 'md',
    className = '',
}: RatingProps) {
    const isControlled = value !== undefined
    const [internal, setInternal] = useState(defaultValue ?? 0)
    const current = isControlled ? value : internal
    const [hover, setHover] = useState<number | null>(null)

    const shown = hover ?? current

    function select(next: number) {
        if (readOnly) return
        if (!isControlled) setInternal(next)
        onChange?.(next)
    }

    return (
        <div
            className={`inline-flex items-center gap-1 ${sizeClasses[size]} ${className}`}
            onMouseLeave={() => setHover(null)}
            role={readOnly ? 'img' : 'radiogroup'}
            aria-label={`Rating: ${current} of ${max}`}
        >
            {Array.from({ length: max }, (_, i) => {
                const starValue = i + 1
                const filled = starValue <= shown
                return (
                    <button
                        key={starValue}
                        type="button"
                        disabled={readOnly}
                        aria-label={`${starValue} star${starValue > 1 ? 's' : ''}`}
                        onClick={() => select(starValue)}
                        onMouseEnter={() => !readOnly && setHover(starValue)}
                        className={[
                            'transition-colors duration-100',
                            readOnly ? 'cursor-default' : 'cursor-pointer',
                            filled ? 'text-marigold' : 'text-neutral-300',
                            !readOnly && !filled ? 'hover:text-marigold/60' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <i
                            className={`${filled ? 'fa-solid' : 'fa-regular'} fa-star`}
                            aria-hidden="true"
                        />
                    </button>
                )
            })}
        </div>
    )
}
