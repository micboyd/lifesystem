import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Container from '../components/Container'
import Tabs from '../components/Tabs'

const TABS = ['Monthly', 'Budgets', 'Logs', 'Forecast'] as const
type FinanceTab = (typeof TABS)[number]

const PATHS: Record<FinanceTab, string> = {
    Monthly: '/finances',
    Budgets: '/finances/budgets',
    Logs: '/finances/daily-log',
    Forecast: '/finances/forecast',
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
            : 'Monthly'

    if (FULL_WIDTH_TABS.includes(active)) {
        return (
            <main className="min-h-screen">
                <Container className="pt-10">
                    <Tabs
                        tabs={[...TABS]}
                        value={active}
                        onChange={(tab) => navigate(PATHS[tab as FinanceTab])}
                        className="mb-8"
                    />
                </Container>
                <div className="px-4 pb-10 sm:px-6">
                    <Outlet />
                </div>
            </main>
        )
    }

    return (
        <Container as="main" className="py-10">
            <Tabs
                tabs={[...TABS]}
                value={active}
                onChange={(tab) => navigate(PATHS[tab as FinanceTab])}
                className="mb-8"
            />
            <Outlet />
        </Container>
    )
}
