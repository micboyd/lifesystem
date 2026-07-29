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
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-coral-600">
                <span className="h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden="true" />
                {dateLabel}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-[2.6rem] sm:leading-[1.05]">
                {greeting(now)},{' '}
                <span className="text-coral-500">{firstName}</span>
            </h1>
        </header>
    )
}
