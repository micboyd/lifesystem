import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
    label: string
    href?: string
}

interface BreadcrumbsProps {
    items: Crumb[]
    /** Font Awesome class string for the separator. Defaults to a chevron. */
    separator?: string
    className?: string
}

export default function Breadcrumbs({
    items,
    separator = 'fa-solid fa-chevron-right',
    className = '',
}: BreadcrumbsProps) {
    return (
        <nav aria-label="Breadcrumb" className={className}>
            <ol className="flex flex-wrap items-center gap-2 text-sm">
                {items.map((item, i) => {
                    const isLast = i === items.length - 1
                    return (
                        <Fragment key={`${item.label}-${i}`}>
                            <li>
                                {isLast || !item.href ? (
                                    <span
                                        aria-current={isLast ? 'page' : undefined}
                                        className={
                                            isLast
                                                ? 'font-semibold text-neutral-900'
                                                : 'font-medium text-neutral-400'
                                        }
                                    >
                                        {item.label}
                                    </span>
                                ) : (
                                    <Link
                                        to={item.href}
                                        className="font-medium text-neutral-400 transition-colors duration-150 hover:text-neutral-900"
                                    >
                                        {item.label}
                                    </Link>
                                )}
                            </li>
                            {!isLast && (
                                <li aria-hidden="true" className="text-neutral-300">
                                    <i className={`${separator} text-[10px]`} />
                                </li>
                            )}
                        </Fragment>
                    )
                })}
            </ol>
        </nav>
    )
}
