import { useEffect } from 'react'
import { Routes, Route, Outlet, useLocation } from 'react-router-dom'
import { documentTitleForPath } from './lib/pageTitle'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import Day from './pages/Day'
import Timebox from './pages/Timebox'
import Habits from './pages/Habits'
import FinanceLayout from './pages/FinanceLayout'
import Finances from './pages/Finances'
import Budgets from './pages/Budgets'
import BudgetCalendar from './pages/BudgetCalendar'
import SavingsForecast from './pages/SavingsForecast'
import FinanceBreakdown from './pages/FinanceBreakdown'
import Login from './pages/Login'
import Profile from './pages/Profile'
import StyleGuide from './pages/StyleGuide'
import NotFound from './pages/NotFound'

/** The signed-in app shell: nav chrome plus the matched page. */
function AppLayout() {
    return (
        <>
            <Navbar />
            <Outlet />
        </>
    )
}

export default function App() {
    const { pathname } = useLocation()

    // Keep the browser tab title in sync with the active route.
    useEffect(() => {
        document.title = documentTitleForPath(pathname)
    }, [pathname])

    return (
        <Routes>
            {/* Standalone, full-screen, no chrome. */}
            <Route path="/login" element={<Login />} />

            {/* Everything else requires a session and renders inside the shell. */}
            <Route
                element={
                    <ProtectedRoute>
                        <AppLayout />
                    </ProtectedRoute>
                }
            >
                <Route path="/" element={<Home />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/day/:date" element={<Day />} />
                <Route path="/timebox" element={<Timebox />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/finances/breakdown/:rowId" element={<FinanceBreakdown />} />
                <Route path="/finances" element={<FinanceLayout />}>
                    <Route index element={<Finances />} />
                    <Route path="budgets" element={<Budgets />} />
                    <Route path="daily-log" element={<BudgetCalendar />} />
                    <Route path="forecast" element={<SavingsForecast />} />
                </Route>
                <Route path="/profile" element={<Profile />} />
                <Route path="/styleguide" element={<StyleGuide />} />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    )
}
