import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
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
    { label: 'Profile', to: '/profile', icon: 'fa-user' },
]

/** A link is active for its exact path, and — except Home — any nested route. */
function isActive(pathname: string, to: string): boolean {
    if (to === '/') return pathname === '/'
    return pathname === to || pathname.startsWith(`${to}/`)
}

function Brand() {
    return (
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-950 text-sm text-white">
                <i className="fa-solid fa-layer-group" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold tracking-tight text-neutral-900">AdminLife</span>
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
                    <Link
                        key={to}
                        to={to}
                        className={[
                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                            active
                                ? 'bg-neutral-950 text-white'
                                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
                        ].join(' ')}
                    >
                        <i
                            className={`fa-solid ${icon} w-5 shrink-0 text-center text-[0.95rem]`}
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
            className={[
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                moneyHidden
                    ? 'bg-neutral-950 text-white'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
            ].join(' ')}
        >
            <i
                className={`fa-solid ${moneyHidden ? 'fa-eye-slash' : 'fa-eye'} w-5 shrink-0 text-center text-[0.95rem]`}
                aria-hidden="true"
            />
            <span>{moneyHidden ? 'Money hidden' : 'Hide money'}</span>
        </button>
    )
}

export default function Sidebar() {
    const { pathname } = useLocation()
    const [open, setOpen] = useState(false)

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
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-neutral-100 bg-white lg:flex">
                <div className="flex h-16 shrink-0 items-center border-b border-neutral-100 px-5">
                    <Brand />
                </div>
                <NavLinks pathname={pathname} />
                <div className="shrink-0 border-t border-neutral-100 p-3">
                    <MoneyToggleRow />
                </div>
            </aside>

            {/* Mobile top bar */}
            <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-neutral-100 bg-white/95 px-4 backdrop-blur-sm lg:hidden">
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
                        className={`absolute inset-0 bg-neutral-900/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
                    />

                    {/* Panel */}
                    <div
                        className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-100 px-5">
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
                        <div className="shrink-0 border-t border-neutral-100 p-3">
                            <MoneyToggleRow />
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
