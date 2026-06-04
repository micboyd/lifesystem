type SpinnerSize = 'sm' | 'md' | 'lg'

interface SpinnerProps {
    size?: SpinnerSize
    className?: string
}

const sizeClasses: Record<SpinnerSize, string> = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-[3px]',
}

export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
    return (
        <span
            role="status"
            aria-label="Loading"
            className={`inline-block animate-spin rounded-full border-neutral-200 border-t-neutral-900 ${sizeClasses[size]} ${className}`}
        />
    )
}
