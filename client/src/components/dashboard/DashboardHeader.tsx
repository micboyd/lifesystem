import { useAuth } from '../../context/AuthContext'

function greeting(date: Date) {
    const h = date.getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
}

export default function DashboardHeader() {
    const { user } = useAuth()
    const now = new Date()
    const firstName = user?.name?.split(' ')[0] ?? 'there'
    const dateLabel = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    })

    return (
        <header>
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                {dateLabel}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
                {greeting(now)}, {firstName}
            </h1>
        </header>
    )
}
