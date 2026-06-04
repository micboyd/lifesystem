import { Link } from 'react-router-dom'

export default function Home() {
    return (
        <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 bg-neutral-50 px-6 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl">
                Homepage
            </h1>
            <Link
                to="/styleguide"
                className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-neutral-800"
            >
                View the style guide →
            </Link>
        </main>
    )
}
