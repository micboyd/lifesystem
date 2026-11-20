import { Outlet, useLocation } from 'react-router-dom'
import { ModuleBar } from '../components/Blok'
import ModuleLayout from '../components/ModuleLayout'
import RecentSpends from '../components/finance/RecentSpends'

const TABS = ['Monthly', 'Statement', 'Budgets', 'Logs', 'Forecast', 'Spaces'] as const
type FinanceTab = (typeof TABS)[number]

const PATHS: Record<FinanceTab, string> = {
    Monthly: '/finances',
    Statement: '/finances/statement',
    Budgets: '/finances/budgets',
    Logs: '/finances/daily-log',
    Forecast: '/finances/forecast',
    Spaces: '/finances/spaces',
}


const TAB_ICONS: Record<FinanceTab, string> = {
    Monthly: 'fa-solid fa-calendar',
    Statement: 'fa-solid fa-receipt',
    Budgets: 'fa-solid fa-chart-pie',
    Logs: 'fa-solid fa-table-cells',
    Forecast: 'fa-solid fa-chart-line',
    Spaces: 'fa-solid fa-piggy-bank',
}

/** Shared shell for the finance section: its sections down the left (tabs on narrow screens), the active screen beside them. */
export default function FinanceLayout() {
    const { pathname } = useLocation()

    const active: FinanceTab = pathname.startsWith('/finances/daily-log')
        ? 'Logs'
        : pathname.startsWith('/finances/budgets')
          ? 'Budgets'
          : pathname.startsWith('/finances/forecast')
            ? 'Forecast'
            : pathname.startsWith('/finances/spaces')
              ? 'Spaces'
              : pathname.startsWith('/finances/statement')
                ? 'Statement'
                : 'Monthly'

    const sections = TABS.map((t) => ({
        label: t === 'Logs' ? 'Daily log' : t,
        icon: TAB_ICONS[t],
        active: t === active,
        to: PATHS[t],
    }))

    return (
        <>
            <ModuleBar title="Money" />
            <ModuleLayout
                aside={<RecentSpends />}
                asideLabel="Recent spending"
                sections={sections}
                sectionsLabel="Money sections"
            >
                <main className="px-5 pb-24 pt-10 sm:px-10">
                    <Outlet />
                </main>
            </ModuleLayout>
        </>
    )
}
