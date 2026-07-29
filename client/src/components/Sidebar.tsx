import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Avatar from './Avatar'
import { useAuth } from '../context/AuthContext'
import { useMoneyHidden } from './useMoneyHidden'
import { toggleMoneyHidden } from '../lib/moneyVisibility'

const navItems = [
    { label: 'Home', to: '/', icon: 'fa-house' },
    { label: 'Report', to: '/daily-report', icon: 'fa-clipboard-list' },
    { label: 'Calendar', to: '/calendar', icon: 'fa-calendar-days' },
    { label: 'Finances', to: '/finances', icon: 'fa-wallet' },
    { label: 'Timebox', to: '/timebox', icon: 'fa-table-cells-large' },
    { label: 'Habits', to: '/habits', icon: 'fa-repeat' },
    { label: 'Training', to: '/study', icon: 'fa-graduation-cap' },
    { label: 'Notes', to: '/notes', icon: 'fa-note-sticky' },
    { label: 'Weather', to: '/weather', icon: 'fa-cloud-sun' },
]

/** Shared row shape so links and the money toggle stay in lockstep. */
const rowBase =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors'
const rowActive = 'bg-coral-50 text-coral-700 ring-1 ring-coral-100'
const rowIdle = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'

/** A link is active for its exact path, and — except Home — any nested route. */
function isActive(pathname: string, to: string): boolean {
    if (to === '/') return pathname === '/'
    return pathname === to || pathname.startsWith(`${to}/`)
}

function Brand() {
    return (
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-coral-500 text-white shadow-sm shadow-coral-500/30">
                <i className="fa-solid fa-layer-group text-sm" aria-hidden="true" />
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-neutral-900">
                AdminLife
            </span>
        </Link>
    )
}

/** The shared list of destination links, used by both the rail and the drawer. */
function NavLinks({ pathname }: { pathname: string }) {
    return (
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {navItems.map(({ label, to, icon }) => {
                const active = isActive(pathname, to)
                return (
                    <Link key={to} to={to} className={`${rowBase} ${active ? rowActive : rowIdle}`}>
                        <i
                            className={`fa-solid ${icon} w-5 shrink-0 text-center text-[0.95rem] ${active ? 'text-coral-500' : ''}`}
                            aria-hidden="true"
                        />
                        <span>{label}</span>
                    </Link>
                )
            })}
        </nav>
    )
}

/** Full-width row that toggles the master money-visibility switch. */
function MoneyToggleRow() {
    const moneyHidden = useMoneyHidden()
    return (
        <button
            type="button"
            onClick={toggleMoneyHidden}
            aria-pressed={moneyHidden}
            className={`${rowBase} w-full ${moneyHidden ? rowActive : rowIdle}`}
        >
            <i
                className={`fa-solid ${moneyHidden ? 'fa-eye-slash' : 'fa-eye'} w-5 shrink-0 text-center text-[0.95rem] ${moneyHidden ? 'text-coral-500' : ''}`}
                aria-hidden="true"
            />
            <span>{moneyHidden ? 'Money hidden' : 'Hide money'}</span>
        </button>
    )
}

/** Profile chip pinned to the base of the rail. */
function ProfileChip({ active }: { active: boolean }) {
    const { user } = useAuth()
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

export default function Sidebar() {
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
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-black/[0.06] bg-white lg:flex">
                <div className="flex h-16 shrink-0 items-center px-5">
                    <Brand />
                </div>
                <NavLinks pathname={pathname} />
                <div className="shrink-0 space-y-1 border-t border-black/[0.06] p-3">
                    <MoneyToggleRow />
                    <ProfileChip active={profileActive} />
                </div>
            </aside>

            {/* Mobile top bar */}
            <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur-md lg:hidden">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open menu"
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100"
                >
                    <i className="fa-solid fa-bars text-sm" aria-hidden="true" />
                </button>
                <Brand />
                <button
                    type="button"
                    onClick={toggleMoneyHidden}
                    aria-label="Toggle money visibility"
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <MobileMoneyIcon />
                </button>
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
                        <div className="shrink-0 space-y-1 border-t border-black/[0.06] p-3">
                            <MoneyToggleRow />
                            <ProfileChip active={profileActive} />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}

/** Eye icon for the compact mobile top-bar toggle, tracking the shared state. */
function MobileMoneyIcon() {
    const moneyHidden = useMoneyHidden()
    return (
        <i
            className={`fa-solid ${moneyHidden ? 'fa-eye-slash' : 'fa-eye'} text-sm`}
            aria-hidden="true"
        />
    )
}
