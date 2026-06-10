import type { ReactNode } from 'react'

interface CardProps {
    children: ReactNode
    className?: string
}

export function Card({ children, className = '' }: CardProps) {
    return (
        <div
            className={`rounded-2xl border border-neutral-100 bg-white p-6 transition-all duration-300 hover:border-neutral-200 hover:shadow-md hover:-translate-y-0.5 ${className}`}
        >
            {children}
        </div>
    )
}

export function CardHeader({ children, className = '' }: CardProps) {
    return <div className={`mb-4 ${className}`}>{children}</div>
}

export function CardTitle({ children, className = '' }: CardProps) {
    return (
        <h3 className={`text-lg font-bold tracking-tight text-neutral-900 ${className}`}>
            {children}
        </h3>
    )
}

export function CardBody({ children, className = '' }: CardProps) {
    return <div className={`text-sm leading-relaxed text-neutral-500 ${className}`}>{children}</div>
}

export function CardFooter({ children, className = '' }: CardProps) {
    return <div className={`mt-6 pt-4 border-t border-neutral-100 ${className}`}>{children}</div>
}
