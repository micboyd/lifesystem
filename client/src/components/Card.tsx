interface CardProps {
    children: React.ReactNode
    className?: string
}

export function Card({ children, className = '' }: CardProps) {
    return <div className={`bg-white border border-neutral-200 p-6 ${className}`}>{children}</div>
}

export function CardHeader({ children, className = '' }: CardProps) {
    return <div className={`mb-4 ${className}`}>{children}</div>
}

export function CardTitle({ children, className = '' }: CardProps) {
    return (
        <h3 className={`text-xl font-bold tracking-tight text-black ${className}`}>{children}</h3>
    )
}

export function CardBody({ children, className = '' }: CardProps) {
    return <div className={`text-neutral-600 text-sm leading-relaxed ${className}`}>{children}</div>
}

export function CardFooter({ children, className = '' }: CardProps) {
    return <div className={`mt-6 pt-4 border-t border-neutral-200 ${className}`}>{children}</div>
}
