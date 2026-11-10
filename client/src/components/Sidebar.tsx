import { useState, useEffect, useRef, type TouchEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Avatar from './Avatar'
import QuickLog from './QuickLog'
import { useMediaQuery } from './planner/WeekPlannerUI'
import { useAuth } from '../context/AuthContext'
import { BRAND, NAV_GROUPS, NAV_ITEMS, type NavItem } from '../lib/workspace'

/** Shared row shape for nav links. */
const rowBase = 'flex h-10 items-center gap-3 rounded-xl px-2 text-sm font-medium transition-colors'
const rowIdle = 'text-neutral-700 hover:bg-white/70 hover:text-neutral-900'

/** The tinted tile each destination's icon sits in, in its life area's colour. */
function NavTile({ icon, tone, size = 'sm' }: { icon: string; tone: string; size?: 'sm' | 'lg' }) {
    const box =
        size === 'lg' ? 'h-10 w-10 rounded-[12px] text-[15px]' : 'h-7 w-7 rounded-lg text-[12px]'
    return (
        <span className={`grid shrink-0 place-items-center ${box} ${tone}`} aria-hidden="true">
            <i className={`fa-solid ${icon}`} />
        </span>
    )
}

/**
 * A link is active for its exact path and any nested route — except the root
 * ("/"), which would otherwise match everything beneath it.
 */
function isActive(pathname: string, to: string): boolean {
    if (to === '/') return pathname === to
    return pathname === to || pathname.startsWith(`${to}/`)
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
    return (
        <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0"
            title={collapsed ? BRAND.name : undefined}
        >
            <span className={`grid h-8 w-8 place-items-center rounded-[10px] ${BRAND.markClass}`}>
                <i className={`fa-solid ${BRAND.icon} text-sm`} aria-hidden="true" />
            </span>
            {!collapsed && (
                <span className="text-[15px] font-extrabold tracking-tight text-neutral-900">
                    {BRAND.name}
                </span>
            )}
        </Link>
    )
}

/** The flat list of destination links in the desktop rail. */
function NavLinks({
    pathname,
    items,
    collapsed = false,
}: {
    pathname: string
    items: NavItem[]
    collapsed?: boolean
}) {
    return (
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {items.map(({ label, to, icon, tone }) => {
                const active = isActive(pathname, to)
                return (
                    <Link
                        key={to}
                        to={to}
                        title={collapsed ? label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={`${rowBase} ${collapsed ? 'justify-center px-0' : ''} ${active ? BRAND.navActiveClass : rowIdle}`}
                    >
                        <NavTile icon={icon} tone={tone} />
                        {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                )
            })}
        </nav>
    )
}

/** Profile chip pinned to the base of the rail. */
function ProfileChip({ active, collapsed = false }: { active: boolean; collapsed?: boolean }) {
    const { user } = useAuth()
    if (collapsed) {
        return (
            <Link
                to="/profile"
                title={user?.name ?? 'Your profile'}
                className={[
                    'flex justify-center rounded-[14px] px-2.5 py-2.5 transition-colors',
                    active ? BRAND.profileActiveClass : 'hover:bg-neutral-100',
                ].join(' ')}
            >
                <Avatar name={user?.name} size="sm" />
            </Link>
        )
    }
    return (
        <Link
            to="/profile"
            className={[
                'flex items-center gap-3 rounded-[14px] px-2.5 py-2.5 transition-colors',
                active ? BRAND.profileActiveClass : 'hover:bg-neutral-100',
            ].join(' ')}
        >
            <Avatar name={user?.name} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                    {user?.name ?? 'Your profile'}
                </p>
                <p className="truncate text-xs text-neutral-500">View profile</p>
            </div>
        </Link>
    )
}

export default function Sidebar({
    collapsed = false,
    onToggle,
}: {
    collapsed?: boolean
    onToggle?: () => void
}) {
    const { pathname } = useLocation()
    const profileActive = isActive(pathname, '/profile')
    const wide = useMediaQuery('(min-width: 1024px)')

    return (
        <>
            {/* Desktop rail */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-black/[0.05] bg-canvas transition-[width] duration-200 ease-out lg:flex ${collapsed ? 'w-20' : 'w-64'}`}
            >
                <div
                    className={`flex h-16 shrink-0 items-center ${collapsed ? 'justify-center px-0' : 'px-5'}`}
                >
                    <Brand collapsed={collapsed} />
                </div>
                <NavLinks pathname={pathname} items={NAV_ITEMS} collapsed={collapsed} />
                <div className="flex shrink-0 flex-col gap-2 p-3">
                    {/* Safe to spend today, and where a spend is logged, on wide screens. */}
                    {wide && <QuickLog variant="rail" collapsed={collapsed} />}
                    <ProfileChip active={profileActive} collapsed={collapsed} />
                </div>

                {/* Collapse / expand toggle, straddling the rail's right edge. */}
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors hover:text-neutral-700"
                >
                    <i
                        className={`fa-solid fa-chevron-left text-[11px] transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                </button>
            </aside>

            <MobileNav pathname={pathname} />
        </>
    )
}

/** NAV_ITEMS split into NAV_GROUPS; anything ungrouped trails as "More". */
function groupedNav(): { label: string; items: NavItem[] }[] {
    const byPath = new Map(NAV_ITEMS.map((item) => [item.to, item]))
    const groups = NAV_GROUPS.map((g) => ({
        label: g.label,
        items: g.paths.flatMap((p) => byPath.get(p) ?? []),
    }))
    const grouped = new Set(NAV_GROUPS.flatMap((g) => g.paths))
    const rest = NAV_ITEMS.filter((item) => !grouped.has(item.to))
    if (rest.length) groups.push({ label: 'More', items: rest })
    return groups.filter((g) => g.items.length)
}

const NAV_GROUPED = groupedNav()

/** The nav item whose section the current path sits in, for the top bar. */
function currentItem(pathname: string): NavItem | undefined {
    return NAV_ITEMS.find((item) => isActive(pathname, item.to))
}

/** How far (px) a left swipe must travel before the drawer closes. */
const SWIPE_CLOSE = 72

/** Phone top bar plus the slide-in menu it opens. */
function MobileNav({ pathname }: { pathname: string }) {
    const { user } = useAuth()
    // Remember which page the menu was opened on, so navigating closes it.
    const [openOn, setOpenOn] = useState<string | null>(null)
    const open = openOn === pathname
    const setOpen = (next: boolean) => setOpenOn(next ? pathname : null)
    const [dragX, setDragX] = useState(0)
    const [dragging, setDragging] = useState(false)
    const touchStart = useRef<{ x: number; y: number } | null>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    const current = currentItem(pathname)
    const profileActive = isActive(pathname, '/profile')

    // While open: lock body scroll, close on Escape, focus the close button.
    useEffect(() => {
        if (!open) return
        document.body.style.overflow = 'hidden'
        closeRef.current?.focus({ preventScroll: true })
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenOn(null)
        }
        window.addEventListener('keydown', onKey)
        return () => {
            document.body.style.overflow = ''
            window.removeEventListener('keydown', onKey)
        }
    }, [open])

    // Swipe left on the panel to close; vertical scrolls are left alone.
    function onTouchStart(e: TouchEvent) {
        const t = e.touches[0]
        touchStart.current = { x: t.clientX, y: t.clientY }
    }
    function onTouchMove(e: TouchEvent) {
        const start = touchStart.current
        if (!start) return
        const t = e.touches[0]
        const dx = t.clientX - start.x
        const dy = t.clientY - start.y
        if (!dragging) {
            if (Math.abs(dx) < 8) return
            if (Math.abs(dy) > Math.abs(dx)) {
                touchStart.current = null
                return
            }
            setDragging(true)
        }
        setDragX(Math.min(0, dx))
    }
    function onTouchEnd() {
        if (dragX < -SWIPE_CLOSE) setOpen(false)
        touchStart.current = null
        setDragging(false)
        setDragX(0)
    }

    const panelTransform = open ? `translateX(${dragX}px)` : 'translateX(-100%)'

    return (
        <>
            {/* Top bar */}
            <div className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
                <div className="flex h-14 items-center gap-1 px-2">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        aria-label="Open menu"
                        aria-expanded={open}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-neutral-700 transition-colors hover:bg-neutral-100 active:bg-neutral-100"
                    >
                        <i className="fa-solid fa-bars-staggered text-[15px]" aria-hidden="true" />
                    </button>
                    <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
                        <span
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-[9px] ${BRAND.markClass}`}
                        >
                            <i
                                className={`fa-solid ${BRAND.icon} text-[12px]`}
                                aria-hidden="true"
                            />
                        </span>
                        <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">
                            {current && current.to !== '/' ? current.label : BRAND.name}
                        </span>
                    </Link>
                    <Link
                        to="/profile"
                        aria-label="Your profile"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                    >
                        <Avatar name={user?.name} size="sm" />
                    </Link>
                </div>
            </div>

            {/* Drawer */}
            {createPortal(
                <div
                    className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}
                    aria-hidden={!open}
                >
                    <div
                        onClick={() => setOpen(false)}
                        className={`absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
                    />

                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu"
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                        onTouchCancel={onTouchEnd}
                        style={{ transform: panelTransform }}
                        className={[
                            'absolute inset-0 flex flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
                            dragging
                                ? ''
                                : 'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                        ].join(' ')}
                    >
                        {/* Header: who's signed in, plus close */}
                        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-100 px-3 py-3">
                            <Link
                                to="/profile"
                                className={[
                                    'flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[14px] p-2 transition-colors',
                                    profileActive
                                        ? BRAND.profileActiveClass
                                        : 'hover:bg-neutral-100 active:bg-neutral-100',
                                ].join(' ')}
                            >
                                <Avatar name={user?.name} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-base font-semibold text-neutral-900">
                                        {user?.name ?? 'Your profile'}
                                    </p>
                                    <p className="truncate text-[13px] text-neutral-500">
                                        View profile
                                    </p>
                                </div>
                            </Link>
                            <button
                                ref={closeRef}
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close menu"
                                className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-neutral-100 text-neutral-700 transition-colors hover:bg-neutral-200 active:bg-neutral-200"
                            >
                                <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
                            </button>
                        </div>

                        {/* Grouped destinations */}
                        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-4">
                            {NAV_GROUPED.map((group) => (
                                <section key={group.label} className="pb-5 last:pb-0">
                                    <h3 className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                                        {group.label}
                                    </h3>
                                    <ul className="flex flex-col gap-1">
                                        {group.items.map(({ label, to, icon, tone }) => {
                                            const active = isActive(pathname, to)
                                            return (
                                                <li key={to}>
                                                    <Link
                                                        to={to}
                                                        aria-current={active ? 'page' : undefined}
                                                        className={[
                                                            'flex h-14 items-center gap-3.5 rounded-[14px] px-2.5 text-[17px] font-medium transition-colors',
                                                            active
                                                                ? 'bg-neutral-100 text-neutral-900'
                                                                : 'text-neutral-800 hover:bg-neutral-100 active:bg-neutral-100',
                                                        ].join(' ')}
                                                    >
                                                        <NavTile
                                                            icon={icon}
                                                            tone={tone}
                                                            size="lg"
                                                        />
                                                        <span className="flex-1 truncate">
                                                            {label}
                                                        </span>
                                                        {active ? (
                                                            <span
                                                                className="h-2 w-2 rounded-full bg-coral-500"
                                                                aria-hidden="true"
                                                            />
                                                        ) : (
                                                            <i
                                                                className="fa-solid fa-chevron-right text-xs text-neutral-300"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                    </Link>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </nav>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
