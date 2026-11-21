import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMediaQuery } from './planner/WeekPlannerUI'
import { revealActive } from './Tabs'
import { Link } from 'react-router-dom'

/** One section of a module: a page of its own, reached by link or by switching state. */
export interface Section {
    label: string
    /** Font Awesome classes for the folded strip, e.g. "fa-solid fa-dumbbell". */
    icon: string
    active: boolean
    to?: string
    onClick?: () => void
}

function SectionLink({
    section,
    className,
    onDone,
    children,
}: {
    section: Section
    className: string
    onDone?: () => void
    children: ReactNode
}) {
    const current = section.active ? ('page' as const) : undefined
    if (section.to)
        return (
            <Link to={section.to} aria-current={current} className={className} onClick={onDone}>
                {children}
            </Link>
        )
    return (
        <button
            type="button"
            aria-current={current}
            className={className}
            onClick={() => {
                section.onClick?.()
                onDone?.()
            }}
        >
            {children}
        </button>
    )
}

/**
 * A module's sections down the left, as on Today: names on a thin rule, the
 * current one marked with a black bar. `folded` (an icon strip) is kept for
 * pages that ask for it; none do by default.
 */
export function SectionRail({ label, sections, folded = false }: { label: string; sections: Section[]; folded?: boolean }) {
    const [open, setOpen] = useState(false)

    if (!folded)
        return (
            <nav aria-label={label} className="w-[240px] shrink-0 pb-10 pl-10 pt-10">
                <ul className="sticky top-[112px] border-l border-[#d9d9d9] text-[17px] leading-6">
                    {sections.map((s) => (
                        <li key={s.label}>
                            <SectionLink
                                section={s}
                                className={`block w-full py-2.5 text-left ${
                                    s.active
                                        ? '-ml-px border-l-2 border-[#111111] pl-[18px] text-[#111111]'
                                        : 'pl-[19px] text-[#666666] hover:text-[#111111]'
                                }`}
                            >
                                {s.label}
                            </SectionLink>
                        </li>
                    ))}
                </ul>
            </nav>
        )

    return (
        <nav aria-label={label} className="relative w-[76px] shrink-0 border-r border-hairline">
            <div className="sticky top-18 pt-3">
                <button
                    type="button"
                    aria-label={open ? 'Hide section names' : 'Show section names'}
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                    className="grid h-11 w-[76px] place-items-center hover:bg-neutral-50"
                >
                    <i className={`fa-solid ${open ? 'fa-chevron-left' : 'fa-chevron-right'} text-[12px]`} aria-hidden="true" />
                </button>
                <ul className="mt-1">
                    {sections.map((s) => (
                        <li key={s.label}>
                            <SectionLink
                                section={s}
                                className={`flex w-full flex-col items-center gap-1.5 px-1 py-3 text-[10px] leading-tight tracking-[0.02em] ${
                                    s.active ? 'text-neutral-900 shadow-[inset_2px_0_0_#111111]' : 'text-neutral-600 hover:text-neutral-900'
                                }`}
                            >
                                <i className={`${s.icon} text-[17px]`} aria-hidden="true" />
                                <span className="max-w-full truncate">{s.label}</span>
                            </SectionLink>
                        </li>
                    ))}
                </ul>
            </div>

            {open && (
                <>
                    <button
                        type="button"
                        aria-label="Close section names"
                        tabIndex={-1}
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-30 cursor-default bg-transparent"
                    />
                    <div className="absolute left-full top-0 z-40 w-[240px] border border-neutral-900 bg-white">
                        <ul className="sticky top-18">
                            {sections.map((s) => (
                                <li key={s.label} className="border-b border-hairline last:border-b-0">
                                    <SectionLink
                                        section={s}
                                        onDone={() => setOpen(false)}
                                        className={`flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] ${
                                            s.active ? 'font-medium text-neutral-900' : 'text-neutral-700 hover:bg-neutral-50'
                                        }`}
                                    >
                                        <i className={`${s.icon} w-4 text-center text-[14px]`} aria-hidden="true" />
                                        {s.label}
                                    </SectionLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}
        </nav>
    )
}

/** Below 1100px the sections stack at the top of the page: the same names on a thin rule, the current one barred. */
export function SectionTabs({ label, sections }: { label: string; sections: Section[] }) {
    const phone = !useMediaQuery('(min-width: 640px)')
    if (phone) return <SectionScroller label={label} sections={sections} />
    return (
        <nav aria-label={label} className="px-5 pt-6 sm:px-10">
            <ul className="border-l border-[#d9d9d9] text-[15px] leading-5">
                {sections.map((s) => (
                    <li key={s.label}>
                        <SectionLink
                            section={s}
                            className={`flex min-h-11 w-full items-center text-left ${
                                s.active
                                    ? '-ml-px border-l-2 border-[#111111] pl-3.5 text-[#111111]'
                                    : 'pl-[15px] text-[#666666] hover:text-[#111111]'
                            }`}
                        >
                            {s.label}
                        </SectionLink>
                    </li>
                ))}
            </ul>
        </nav>
    )
}

/**
 * Phones: the sections as one swipeable row of tabs under a hairline, the current
 * one underlined — the stacked list cost a third of the screen on every visit.
 */
function SectionScroller({ label, sections }: { label: string; sections: Section[] }) {
    const rowRef = useRef<HTMLUListElement>(null)
    const activeRef = useRef<HTMLLIElement>(null)
    const active = sections.find((s) => s.active)?.label
    useEffect(() => {
        revealActive(rowRef.current, activeRef.current)
    }, [active])
    return (
        <nav aria-label={label} className="border-b border-hairline">
            <ul ref={rowRef} className="scrollbar-none flex gap-6 overflow-x-auto px-5 text-[15px] leading-5">
                {sections.map((s) => (
                    <li key={s.label} ref={s.active ? activeRef : undefined} className="shrink-0">
                        <SectionLink
                            section={s}
                            className={`flex h-12 items-center whitespace-nowrap ${
                                s.active ? 'text-[#111111] shadow-[inset_0_-2px_0_#111111]' : 'text-[#666666] hover:text-[#111111]'
                            }`}
                        >
                            {s.label}
                        </SectionLink>
                    </li>
                ))}
            </ul>
        </nav>
    )
}
