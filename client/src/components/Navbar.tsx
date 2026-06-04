import { Link, useLocation } from 'react-router-dom'
import Container from './Container'

const navLinks = [
    { label: 'Home', to: '/' },
    { label: 'Style Guide', to: '/styleguide' },
]

export default function Navbar() {
    const { pathname } = useLocation()

    return (
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

                    {/* Links */}
                    <div className="flex items-center gap-1">
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
                </nav>
            </Container>
        </div>
    )
}
