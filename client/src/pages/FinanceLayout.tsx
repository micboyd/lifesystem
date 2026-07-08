import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Container from '../components/Container'
import Tabs from '../components/Tabs'

const TABS = ['Monthly', 'Budgets', 'Logs', 'Forecast', 'Spaces outlook'] as const
type FinanceTab = (typeof TABS)[number]

const PATHS: Record<FinanceTab, string> = {
    Monthly: '/finances',
    Budgets: '/finances/budgets',
    Logs: '/finances/daily-log',
    Forecast: '/finances/forecast',
    'Spaces outlook': '/finances/spaces-outlook',
}

const FULL_WIDTH_TABS: FinanceTab[] = ['Logs']

/** Shared shell for the finance section: section tabs above the active screen. */
export default function FinanceLayout() {
    const { pathname } = useLocation()
    const navigate = useNavigate()

    const active: FinanceTab = pathname.startsWith('/finances/daily-log')
        ? 'Logs'
        : pathname.startsWith('/finances/budgets')
          ? 'Budgets'
          : pathname.startsWith('/finances/forecast')
            ? 'Forecast'
            : pathname.startsWith('/finances/spaces-outlook')
              ? 'Spaces outlook'
              : 'Monthly'

    if (FULL_WIDTH_TABS.includes(active)) {
        return (
            <main className="min-h-screen">
                <Container className="pt-10">
                    <div className="mb-8 overflow-x-auto">
                        <Tabs
                            tabs={[...TABS]}
                            value={active}
                            onChange={(tab) => navigate(PATHS[tab as FinanceTab])}
                        />
                    </div>
                </Container>
                <Container fluid className="pb-10">
                    <Outlet />
                </Container>
            </main>
        )
    }

    return (
        <Container as="main" className="py-10">
            <div className="mb-8 overflow-x-auto">
                <Tabs
                    tabs={[...TABS]}
                    value={active}
                    onChange={(tab) => navigate(PATHS[tab as FinanceTab])}
                />
            </div>
            <Outlet />
        </Container>
    )
}
