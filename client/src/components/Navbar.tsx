import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Container from './Container'

const navLinks = [
    { label: 'Home', to: '/' },
    { label: 'Calendar', to: '/calendar' },
    { label: 'Finances', to: '/finances' },
    { label: 'Timebox', to: '/timebox' },
    { label: 'Habits', to: '/habits' },
    { label: 'Profile', to: '/profile' },
]

export default function Navbar() {
    const { pathname } = useLocation()
    const [open, setOpen] = useState(false)

    // Close drawer on route change
    useEffect(() => { setOpen(false) }, [pathname])

    // Lock body scroll while drawer is open
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : ''
        return () => { document.body.style.overflow = '' }
    }, [open])

    return (
        <>
            <div className="sticky top-0 z-40 border-b border-neutral-100 bg-white/95 backdrop-blur-sm">
                <Container>
                    <nav className="flex h-14 items-center justify-between sm:h-16">
                        {/* Brand */}
                        <Link to="/" className="flex items-center gap-2.5 shrink-0">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-950 text-sm text-white">
                                <i className="fa-solid fa-layer-group" aria-hidden="true" />
                            </span>
                            <span className="text-sm font-bold tracking-tight text-neutral-900">
                                Lifesystem
                            </span>
                        </Link>

                        {/* Desktop links */}
                        <div className="hidden items-center gap-1 lg:flex">
                            {navLinks.map(({ label, to }) => {
                                const active = pathname === to
                                return (
                                    <Link
                                        key={to}
                                        to={to}
                                        className={[
                                            'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150',
                                            active
                                                ? 'bg-neutral-950 text-white'
                                                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
                                        ].join(' ')}
                                    >
                                        {label}
                                    </Link>
                                )
                            })}
                        </div>

                        {/* Mobile menu button */}
                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            aria-label="Open menu"
                            className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100 lg:hidden"
                        >
                            <i className="fa-solid fa-bars text-sm" aria-hidden="true" />
                        </button>
                    </nav>
                </Container>
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
                        className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        {/* Drawer header */}
                        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                            <Link to="/" className="flex items-center gap-2.5">
                                <span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-950 text-sm text-white">
                                    <i className="fa-solid fa-layer-group" aria-hidden="true" />
                                </span>
                                <span className="text-sm font-bold tracking-tight text-neutral-900">
                                    Lifesystem
                                </span>
                            </Link>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close menu"
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                            </button>
                        </div>

                        {/* Nav links */}
                        <nav className="flex flex-col gap-1 p-3">
                            {navLinks.map(({ label, to }) => {
                                const active = pathname === to
                                return (
                                    <Link
                                        key={to}
                                        to={to}
                                        className={[
                                            'rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
                                            active
                                                ? 'bg-neutral-950 text-white'
                                                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                                        ].join(' ')}
                                    >
                                        {label}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
