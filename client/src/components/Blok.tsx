import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { revealActive } from './Tabs'

/**
 * AdminLife 3 building blocks, straight from the design system boards: the
 * module bar under the top bar, page heads, small capital labels, the figure
 * strip and the 4px bars. Square corners, ruled lines, black does the work.
 */

export const CAPS = 'text-[11px] font-medium uppercase tracking-[0.12em]'

/** One height for every control: buttons, fields, selects, pickers, icon buttons. */
export const CONTROL_H = 'h-11 lg:h-10'
export const CONTROL_SQ = 'h-11 w-11 lg:h-10 lg:w-10'

/** The module's own bar: its name, underlined tabs, and up to two actions. */
export function ModuleBar({
    title,
    tabs,
    actions,
}: {
    title: string
    tabs?: { label: string; to?: string; onClick?: () => void; active: boolean }[]
    actions?: ReactNode
}) {
    const navRef = useRef<HTMLElement>(null)
    const active = tabs?.find((t) => t.active)?.label
    useEffect(() => {
        revealActive(navRef.current, navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null)
    }, [active])
    return (
        <div className="flex min-h-16 flex-wrap items-center gap-x-8 gap-y-3 border-b border-hairline px-5 sm:px-10">
            <span className="text-[17px] font-medium">{title}</span>
            {tabs && tabs.length > 0 && (
                <nav ref={navRef} aria-label={title} className="-mb-px flex gap-7 self-stretch overflow-x-auto scrollbar-none">
                    {tabs.map((t) => {
                        const cls = `flex shrink-0 items-center whitespace-nowrap ${
                            t.active ? 'text-neutral-900 shadow-[inset_0_-2px_0_#111111]' : 'text-neutral-600 hover:text-neutral-900'
                        }`
                        return t.to ? (
                            <Link key={t.label} to={t.to} aria-current={t.active ? 'page' : undefined} className={cls}>
                                {t.label}
                            </Link>
                        ) : (
                            <button key={t.label} type="button" onClick={t.onClick} aria-current={t.active ? 'page' : undefined} className={cls}>
                                {t.label}
                            </button>
                        )
                    })}
                </nav>
            )}
            {actions && <div className="ml-auto flex min-w-0 max-w-full flex-wrap gap-2 py-3">{actions}</div>}
        </div>
    )
}

/** A black or outline button in the bars: small capitals, optional arrow. */
export function BarButton({
    children,
    onClick,
    to,
    solid = false,
    arrow = false,
    className = '',
    type = 'button',
    disabled,
}: {
    children: ReactNode
    onClick?: () => void
    to?: string
    solid?: boolean
    arrow?: boolean
    className?: string
    type?: 'button' | 'submit'
    disabled?: boolean
}) {
    const cls = `inline-flex h-11 items-center justify-center gap-2.5 lg:h-10 whitespace-nowrap px-[18px] ${CAPS} ${
        solid ? 'bg-neutral-900 text-white hover:bg-black' : 'border border-neutral-900 text-neutral-900 hover:bg-neutral-100'
    } disabled:cursor-not-allowed disabled:opacity-40 ${className}`
    const inner = (
        <>
            {children}
            {arrow && <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden="true" />}
        </>
    )
    return to ? (
        <Link to={to} className={cls}>
            {inner}
        </Link>
    ) : (
        <button type={type} onClick={onClick} className={cls} disabled={disabled}>
            {inner}
        </button>
    )
}

/** Square previous / next arrows. */
export function ArrowButton({ dir, label, onClick }: { dir: 'prev' | 'next'; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="grid h-11 w-11 place-items-center border border-neutral-300 hover:border-neutral-900 lg:h-10 lg:w-10"
        >
            <i className={`fa-solid ${dir === 'prev' ? 'fa-chevron-left' : 'fa-chevron-right'} text-[12px]`} aria-hidden="true" />
        </button>
    )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <p className={`${CAPS} text-neutral-600 ${className}`}>{children}</p>
}

/** The page title: 64px (48px on planners), regular weight, tight. */
export function PageTitle({ children, size = 'lg' }: { children: ReactNode; size?: 'lg' | 'md' }) {
    return (
        <h1
            className={`font-normal leading-[1.05] tracking-[-0.035em] ${
                size === 'lg' ? 'text-[40px] sm:text-[64px]' : 'text-[36px] sm:text-[48px]'
            }`}
        >
            {children}
        </h1>
    )
}

export function Lead({ children }: { children: ReactNode }) {
    return <p className="mt-5 max-w-[640px] text-[17px] leading-normal text-neutral-700 sm:text-[19px]">{children}</p>
}

export function SectionTitle({ children, id, size = 'lg' }: { children: ReactNode; id?: string; size?: 'lg' | 'md' }) {
    return (
        <h2
            id={id}
            className={`font-normal ${size === 'lg' ? 'text-[30px] leading-[1.1] tracking-[-0.025em] sm:text-[36px]' : 'text-[26px] leading-[1.15] tracking-[-0.02em]'}`}
        >
            {children}
        </h2>
    )
}

/** A 4px bar on a pale track. */
export function Bar({ pct, color, track = 'bg-[#ededed]', className = '' }: { pct: number; color: string; track?: string; className?: string }) {
    return (
        <span className={`block h-1 ${track} ${className}`}>
            <span className="block h-1" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
        </span>
    )
}

export interface Figure {
    label: string
    value: ReactNode
    unit?: ReactNode
    note?: ReactNode
    /** 0–100, with its colour: draws a bar under the value. */
    pct?: number
    color?: string
}

/** Four (or so) headline figures in a ruled strip: grey label, big value. */
export function FigureStrip({ figures, size = 36 }: { figures: Figure[]; size?: 32 | 36 }) {
    return (
        <dl className="grid grid-cols-2 border-t border-neutral-900 md:grid-cols-4">
            {figures.map((f) => (
                <div key={f.label} className="border-b border-hairline pb-5 pr-5 pt-[18px]">
                    <dt className="text-[13px] text-neutral-600">{f.label}</dt>
                    <dd
                        className={`mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 leading-none tracking-[-0.03em] ${size === 36 ? 'text-[30px] sm:text-[36px]' : 'text-[28px] sm:text-[32px]'}`}
                    >
                        {f.value}
                        {f.unit && <span className="whitespace-nowrap text-[13px] tracking-normal text-neutral-600">{f.unit}</span>}
                    </dd>
                    {f.pct !== undefined && f.color && <Bar pct={f.pct} color={f.color} className="mt-3.5" />}
                    {f.note && <dd className="mt-2.5 text-[13px] text-neutral-600">{f.note}</dd>}
                </div>
            ))}
        </dl>
    )
}

/** A done mark: a filled black square with a white tick. */
export function DoneTick({ label = 'Done', size = 14 }: { label?: string; size?: number }) {
    return (
        <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 16 16" className="shrink-0">
            <rect width="16" height="16" fill="#111111" />
            <path d="m4 8.3 2.6 2.6L12 5.6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/** The grey panel's heading: small caps eyebrow and a 26px title. */
export function PanelHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
    return (
        <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2 className="mt-3 text-[26px] font-normal leading-[1.15] tracking-[-0.02em]">{title}</h2>
            {children}
        </div>
    )
}
