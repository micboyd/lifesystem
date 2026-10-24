import { useEffect, useState } from 'react'
import { Routes, Route, Outlet, Navigate, useLocation, useParams } from 'react-router-dom'
import { documentTitleForPath } from './lib/pageTitle'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import QuickLog from './components/QuickLog'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import Lists from './pages/Lists'
import Timebox from './pages/Timebox'
import Fitness from './pages/Fitness'
import Nutrition from './pages/Nutrition'
import FinanceLayout from './pages/FinanceLayout'
import Finances from './pages/Finances'
import Statement from './pages/Statement'
import Budgets from './pages/Budgets'
import BudgetCalendar from './pages/BudgetCalendar'
import SavingsForecast from './pages/SavingsForecast'
import Spaces from './pages/Spaces'
import FinanceBreakdown from './pages/FinanceBreakdown'
import Birthdays from './pages/Birthdays'
import DaysSince from './pages/DaysSince'
import DaysUntil from './pages/DaysUntil'
import Goals from './pages/Goals'
import LifePlan from './pages/LifePlan'
import Timeline from './pages/Timeline'
import Notes from './pages/Notes'
import Weather from './pages/Weather'
import Login from './pages/Login'
import Profile from './pages/Profile'
import StyleGuide from './pages/StyleGuide'
import NotFound from './pages/NotFound'

/** The signed-in app shell: sidebar nav plus the matched page. */
function AppLayout() {
    // Persist the desktop rail's collapsed state across reloads.
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') !== '0'
    )
    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0')
    }, [collapsed])

    return (
        <div className="min-h-screen bg-canvas">
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
            {/* Offset the content column for the fixed rail on large screens. */}
            <div
                className={`flex min-h-screen flex-col transition-[padding] duration-200 ease-out ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}
            >
                <main className="flex-1">
                    <Outlet />
                </main>
                <QuickLog />
            </div>
        </div>
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
                <Route path="/day/:date" element={<DayRedirect />} />
                <Route path="/timebox" element={<Timebox />} />
                <Route path="/habits" element={<Navigate to="/goals" replace />} />
                <Route path="/fitness" element={<Fitness />} />
                <Route path="/nutrition" element={<Nutrition />} />
                <Route path="/finances/breakdown/:rowId" element={<FinanceBreakdown />} />
                <Route path="/finances" element={<FinanceLayout />}>
                    <Route index element={<Finances />} />
                    <Route path="statement" element={<Statement />} />
                    <Route path="budgets" element={<Budgets />} />
                    <Route path="daily-log" element={<BudgetCalendar />} />
                    <Route path="forecast" element={<SavingsForecast />} />
                    <Route path="spaces" element={<Spaces />} />
                </Route>
                <Route path="/profile" element={<Profile />} />
                <Route path="/birthdays" element={<Birthdays />} />
                <Route path="/days-since" element={<DaysSince />} />
                <Route path="/days-until" element={<DaysUntil />} />
                <Route path="/weather" element={<Weather />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/life-plan" element={<LifePlan />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/lists" element={<Lists />} />
                <Route path="/lists/:id" element={<Lists />} />
                <Route path="/styleguide" element={<StyleGuide />} />

                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    )
}

/** The old per-day page is gone; its links land on that day's week in the calendar. */
function DayRedirect() {
    const { date } = useParams<{ date: string }>()
    return <Navigate to={date ? `/calendar?date=${date}` : '/calendar'} replace />
}
