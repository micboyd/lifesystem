import { Link } from 'react-router-dom'

export default function NotFound() {
    return (
        <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Error 404
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-neutral-950">Page not found</h1>
            <Link
                to="/"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-neutral-800"
            >
                ← Back to home
            </Link>
        </main>
    )
}
