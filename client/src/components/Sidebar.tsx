import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Avatar from './Avatar'
import { useAuth } from '../context/AuthContext'

const navItems = [
    { label: 'Home', to: '/', icon: 'fa-house' },
    { label: 'Calendar', to: '/calendar', icon: 'fa-calendar-days' },
    { label: 'Life Plan', to: '/life-plan', icon: 'fa-compass' },
    { label: 'Finances', to: '/finances', icon: 'fa-wallet' },
    { label: 'Timebox', to: '/timebox', icon: 'fa-table-cells-large' },
    { label: 'Habits', to: '/habits', icon: 'fa-repeat' },
    { label: 'Goals', to: '/goals', icon: 'fa-bullseye' },
    { label: 'Studying', to: '/study', icon: 'fa-graduation-cap' },
    { label: 'Fitness', to: '/fitness', icon: 'fa-dumbbell' },
    { label: 'Nutrition', to: '/nutrition', icon: 'fa-bowl-food' },
    { label: 'Notes', to: '/notes', icon: 'fa-note-sticky' },
    { label: 'Checklists', to: '/checklists', icon: 'fa-list-check' },
    { label: 'Weather', to: '/weather', icon: 'fa-cloud-sun' },
]

/** Shared row shape for nav links. */
const rowBase =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors'
const rowActive = 'bg-coral-50 text-coral-700 ring-1 ring-coral-100'
const rowIdle = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'

/** A link is active for its exact path, and — except Home — any nested route. */
function isActive(pathname: string, to: string): boolean {
    if (to === '/') return pathname === '/'
    return pathname === to || pathname.startsWith(`${to}/`)
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
    return (
        <Link to="/" className="flex items-center gap-2.5 shrink-0" title={collapsed ? 'AdminLife' : undefined}>
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-coral-500 text-white shadow-sm shadow-coral-500/30">
                <i className="fa-solid fa-layer-group text-sm" aria-hidden="true" />
            </span>
            {!collapsed && (
                <span className="text-[15px] font-extrabold tracking-tight text-neutral-900">
                    AdminLife
                </span>
            )}
        </Link>
    )
}

/** The shared list of destination links, used by both the rail and the drawer. */
function NavLinks({ pathname, collapsed = false }: { pathname: string; collapsed?: boolean }) {
    return (
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {navItems.map(({ label, to, icon }) => {
                const active = isActive(pathname, to)
                return (
                    <Link
                        key={to}
                        to={to}
                        title={collapsed ? label : undefined}
                        className={`${rowBase} ${collapsed ? 'justify-center px-0' : ''} ${active ? rowActive : rowIdle}`}
                    >
                        <i
                            className={`fa-solid ${icon} w-5 shrink-0 text-center text-[0.95rem] ${active ? 'text-coral-500' : ''}`}
                            aria-hidden="true"
                        />
                        {!collapsed && <span>{label}</span>}
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
                    'flex justify-center rounded-2xl px-2.5 py-2.5 transition-colors',
                    active ? 'bg-coral-50 ring-1 ring-coral-100' : 'hover:bg-neutral-100',
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
                'flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors',
                active ? 'bg-coral-50 ring-1 ring-coral-100' : 'hover:bg-neutral-100',
            ].join(' ')}
        >
            <Avatar name={user?.name} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-neutral-900">
                    {user?.name ?? 'Your profile'}
                </p>
                <p className="truncate text-xs text-neutral-400">View profile</p>
            </div>
            <i className="fa-solid fa-chevron-right text-[10px] text-neutral-300" aria-hidden="true" />
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
    const [open, setOpen] = useState(false)
    const profileActive = isActive(pathname, '/profile')

    // Close the mobile drawer on navigation.
    useEffect(() => {
        setOpen(false)
    }, [pathname])

    // Lock body scroll while the drawer is open.
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [open])

    return (
        <>
            {/* Desktop rail */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-black/[0.06] bg-white transition-[width] duration-200 ease-out lg:flex ${collapsed ? 'w-20' : 'w-64'}`}
            >
                <div className={`flex h-16 shrink-0 items-center ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
                    <Brand collapsed={collapsed} />
                </div>
                <NavLinks pathname={pathname} collapsed={collapsed} />
                <div className="shrink-0 border-t border-black/[0.06] p-3">
                    <ProfileChip active={profileActive} collapsed={collapsed} />
                </div>

                {/* Collapse / expand toggle, straddling the rail's right edge. */}
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full border border-black/[0.06] bg-white text-neutral-400 shadow-sm transition-colors hover:text-neutral-700"
                >
                    <i
                        className={`fa-solid fa-chevron-left text-[10px] transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                </button>
            </aside>

            {/* Mobile top bar */}
            <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur-md lg:hidden">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open menu"
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100"
                >
                    <i className="fa-solid fa-bars text-sm" aria-hidden="true" />
                </button>
                <Brand />
            </div>

            {/* Mobile drawer */}
            {createPortal(
                <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
                    {/* Backdrop */}
                    <div
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                        className={`absolute inset-0 bg-neutral-900/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
                    />

                    {/* Panel */}
                    <div
                        className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        <div className="flex h-16 shrink-0 items-center justify-between px-5">
                            <Brand />
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close menu"
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                            </button>
                        </div>
                        <NavLinks pathname={pathname} />
                        <div className="shrink-0 border-t border-black/[0.06] p-3">
                            <ProfileChip active={profileActive} />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
