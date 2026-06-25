import { Link } from 'react-router-dom'
import Container from './Container'

const footerLinks = [
    { label: 'Home', to: '/' },
    { label: 'Calendar', to: '/calendar' },
    { label: 'Finances', to: '/finances' },
    { label: 'Habits', to: '/habits' },
    { label: 'Study', to: '/study' },
    { label: 'Profile', to: '/profile' },
]

/** Product-wide footer: brand, quick links, and breathing room at page bottom. */
export default function Footer() {
    const year = new Date().getFullYear()

    return (
        <footer className="mt-16 border-t border-neutral-800 bg-neutral-950">
            <Container>
                <div className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
                    {/* Brand */}
                    <Link to="/" className="flex items-center gap-2.5 shrink-0">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-sm text-neutral-950">
                            <i className="fa-solid fa-layer-group" aria-hidden="true" />
                        </span>
                        <span className="text-sm font-bold tracking-tight text-white">
                            AdminLife
                        </span>
                    </Link>

                    {/* Quick links */}
                    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        {footerLinks.map(({ label, to }) => (
                            <Link
                                key={to}
                                to={to}
                                className="text-sm font-medium text-neutral-400 transition-colors hover:text-white"
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="border-t border-neutral-800 py-6">
                    <p className="text-xs text-neutral-500">
                        &copy; {year} AdminLife. All rights reserved.
                    </p>
                </div>
            </Container>
        </footer>
    )
}
