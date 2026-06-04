type AvatarSize = 'sm' | 'md' | 'lg'

interface AvatarProps {
    src?: string
    name?: string
    size?: AvatarSize
    className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
}

function initials(name?: string) {
    if (!name) return '?'
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')
}

export default function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
    const base = `inline-grid place-items-center overflow-hidden rounded-full shrink-0 ${sizeClasses[size]} ${className}`

    if (src) {
        return <img src={src} alt={name ?? 'Avatar'} className={`${base} object-cover`} />
    }

    return (
        <span className={`${base} bg-neutral-950 font-semibold text-white`} aria-label={name}>
            {initials(name)}
        </span>
    )
}
