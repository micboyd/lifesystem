import { Link } from 'react-router-dom'
import Container from '../../components/Container'
import { Card } from '../../components/Card'
import Badge from '../../components/Badge'
import { WORK_MODULES } from '../../lib/workspace'

/** "Tuesday, 25 August 2026" */
function today(): string {
    return new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

/**
 * The work workspace's landing page. Deliberately holds no data yet — until
 * modules exist there is nothing honest to summarise, so it serves as a map of
 * what the workspace is going to be and a way into each placeholder.
 */
export default function Dashboard() {
    return (
        <Container as="main" className="py-10">
            <header className="mb-6">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">
                        Work
                    </h1>
                    <Badge variant="outline">Shell</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-500">{today()}</p>
            </header>

            <Card hover={false} className="mb-8">
                <div className="flex items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                        <i className="fa-solid fa-compass-drafting" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-base font-bold tracking-tight text-neutral-900">
                            Nothing built yet
                        </h2>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                            This workspace shares the app's shell, sign-in and components — only the
                            navigation and the accent change. Every module below is a live route
                            with an empty page behind it, so the shape can be rearranged before any
                            of it is real.
                        </p>
                    </div>
                </div>
            </Card>

            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Planned modules
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {WORK_MODULES.map(({ label, to, icon, blurb }) => (
                    <Link key={to} to={to} className="group">
                        <Card className="h-full">
                            <div className="flex items-start gap-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-400 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600">
                                    <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-bold tracking-tight text-neutral-900">
                                        {label}
                                    </h3>
                                    <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                                        {blurb}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>
        </Container>
    )
}
