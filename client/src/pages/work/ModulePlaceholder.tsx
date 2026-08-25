import { Link, useLocation } from 'react-router-dom'
import Container from '../../components/Container'
import { Card } from '../../components/Card'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import { navItemForPath } from '../../lib/workspace'

/**
 * Stands in for every unbuilt work module. It reads its own identity from the
 * nav config rather than taking props, so a module's name, icon and one-line
 * purpose are defined in exactly one place — and replacing this with the real
 * page is a one-line route change.
 */
export default function ModulePlaceholder() {
    const { pathname } = useLocation()
    const item = navItemForPath(pathname)

    return (
        <Container as="main" className="py-10">
            <header className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">
                    {item?.label ?? 'Work'}
                </h1>
                {item?.blurb && <p className="mt-1 text-sm text-neutral-500">{item.blurb}</p>}
            </header>

            <Card hover={false}>
                <EmptyState
                    icon={`fa-solid ${item?.icon ?? 'fa-briefcase'}`}
                    title="Not built yet"
                    description="This module is part of the work workspace shell — the route, the nav entry and the page exist, but there's nothing behind it."
                    action={
                        <Link to="/work">
                            <Button variant="secondary" icon="fa-solid fa-arrow-left">
                                Back to dashboard
                            </Button>
                        </Link>
                    }
                />
            </Card>
        </Container>
    )
}
