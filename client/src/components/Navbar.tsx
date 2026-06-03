import { Link, useLocation } from 'react-router-dom'

const navLinks = [
    { label: 'Home', to: '/' },
    { label: 'About', to: '/about' },
    { label: 'Dashboard', to: '/dashboard' },
]

export default function Navbar() {
    const { pathname } = useLocation()

    return (
        <nav className="w-full bg-black text-white">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                {/* Logo */}
                <Link to="/" className="text-xl font-black tracking-tighter">
                    LIFESYSTEM
                </Link>

                {/* Links */}
                <ul className="hidden md:flex items-center gap-8">
                    {navLinks.map(({ label, to }) => (
                        <li key={to}>
                            <Link
                                to={to}
                                className={[
                                    'text-sm font-semibold tracking-tight transition-colors duration-150',
                                    pathname === to
                                        ? 'text-white'
                                        : 'text-neutral-400 hover:text-white',
                                ].join(' ')}
                            >
                                {label}
                            </Link>
                        </li>
                    ))}
                </ul>

                {/* CTA */}
                <Link
                    to="/login"
                    className="bg-white text-black text-sm font-semibold px-5 py-2 hover:bg-neutral-200 transition-colors duration-150"
                >
                    Sign in
                </Link>
            </div>
        </nav>
    )
}
