import { useEffect, useState } from 'react'
import { Routes, Route, Outlet, useLocation } from 'react-router-dom'
import { documentTitleForPath } from './lib/pageTitle'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import QuickLog from './components/QuickLog'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import Day from './pages/Day'
import Timebox from './pages/Timebox'
import Habits from './pages/Habits'
import Study from './pages/Study'
import Fitness from './pages/Fitness'
import Nutrition from './pages/Nutrition'
import NutritionImport from './pages/NutritionImport'
import FinanceLayout from './pages/FinanceLayout'
import Finances from './pages/Finances'
import Budgets from './pages/Budgets'
import BudgetCalendar from './pages/BudgetCalendar'
import SavingsForecast from './pages/SavingsForecast'
import Spaces from './pages/Spaces'
import FinanceBreakdown from './pages/FinanceBreakdown'
import Birthdays from './pages/Birthdays'
import DaysSince from './pages/DaysSince'
import Goals from './pages/Goals'
import Notes from './pages/Notes'
import Checklists from './pages/Checklists'
import Weather from './pages/Weather'
import Login from './pages/Login'
import Profile from './pages/Profile'
import StyleGuide from './pages/StyleGuide'
import NotFound from './pages/NotFound'

/** The signed-in app shell: sidebar nav plus the matched page. */
function AppLayout() {
    // Persist the desktop rail's collapsed state across reloads.
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === '1'
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
                <Route path="/day/:date" element={<Day />} />
                <Route path="/timebox" element={<Timebox />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/study" element={<Study />} />
                <Route path="/fitness" element={<Fitness />} />
                <Route path="/nutrition" element={<Nutrition />} />
                <Route path="/nutrition/import" element={<NutritionImport />} />
                <Route path="/finances/breakdown/:rowId" element={<FinanceBreakdown />} />
                <Route path="/finances" element={<FinanceLayout />}>
                    <Route index element={<Finances />} />
                    <Route path="budgets" element={<Budgets />} />
                    <Route path="daily-log" element={<BudgetCalendar />} />
                    <Route path="forecast" element={<SavingsForecast />} />
                    <Route path="spaces" element={<Spaces />} />
                </Route>
                <Route path="/profile" element={<Profile />} />
                <Route path="/birthdays" element={<Birthdays />} />
                <Route path="/days-since" element={<DaysSince />} />
                <Route path="/weather" element={<Weather />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/checklists" element={<Checklists />} />
                <Route path="/styleguide" element={<StyleGuide />} />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    )
}
