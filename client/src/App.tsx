import { useEffect } from 'react'
import { Routes, Route, Outlet, Navigate, useLocation, useParams } from 'react-router-dom'
import { documentTitleForPath } from './lib/pageTitle'
import AppNav from './components/AppNav'
import { useMediaQuery } from './components/planner/WeekPlannerUI'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import Fitness from './pages/Fitness'
import Nutrition from './pages/Nutrition'
import FinanceLayout from './pages/FinanceLayout'
import Finances from './pages/Finances'
import FinanceImportPanel from './components/finance/FinanceImportPanel'
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
import Timeline from './pages/Timeline'
import Timebox from './pages/Timebox'
import Cleaning from './pages/Cleaning'
import Consistency from './pages/Consistency'
import Walking from './pages/Walking'
import WalkPlanner from './pages/WalkPlanner'
import PrepPage from './pages/PrepPage'
import PlanMenuPage from './pages/PlanMenuPage'
import PlanBuilderPage from './pages/PlanBuilderPage'
import PerfectDay from './pages/PerfectDay'
import Notes from './pages/Notes'
import Weather from './pages/Weather'
import Login from './pages/Login'
import Profile from './pages/Profile'
import StyleGuide from './pages/StyleGuide'
import NotFound from './pages/NotFound'

/** The signed-in app shell: the top bar (and its menu) above the matched page. */
function AppLayout() {
    const wide = useMediaQuery('(min-width: 1024px)')
    return (
        <div className="min-h-screen bg-canvas">
            <AppNav wide={wide} />
            <main>
                <Outlet />
            </main>
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

            {/* The walk planner takes the whole screen: signed in, but no shell. */}
            <Route
                path="/walking/library/:id"
                element={
                    <ProtectedRoute>
                        <WalkPlanner library />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/walking/:id"
                element={
                    <ProtectedRoute>
                        <WalkPlanner />
                    </ProtectedRoute>
                }
            />

            {/* Prep (Nutrition's days → shop → cook stepper) takes the whole screen too. */}
            <Route
                path="/nutrition/prep"
                element={
                    <ProtectedRoute>
                        <PrepPage />
                    </ProtectedRoute>
                }
            />
            <Route path="/nutrition/thinking-ahead" element={<Navigate to="/nutrition/prep" replace />} />

            {/* Building a new nutrition plan, step by step, full screen. */}
            <Route
                path="/nutrition/plans/new"
                element={
                    <ProtectedRoute>
                        <PlanBuilderPage />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/nutrition/plans/:id/edit"
                element={
                    <ProtectedRoute>
                        <PlanBuilderPage />
                    </ProtectedRoute>
                }
            />

            {/* A nutrition plan's meal week, full screen. */}
            <Route
                path="/nutrition/plans/:id/menu"
                element={
                    <ProtectedRoute>
                        <PlanMenuPage />
                    </ProtectedRoute>
                }
            />

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
                    <Route path="import" element={<FinanceImportPanel />} />
                </Route>
                <Route path="/profile" element={<Profile />} />
                <Route path="/perfect-day" element={<PerfectDay />} />
                <Route path="/birthdays" element={<Birthdays />} />
                <Route path="/days-since" element={<DaysSince />} />
                <Route path="/days-until" element={<DaysUntil />} />
                <Route path="/weather" element={<Weather />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/timebox" element={<Timebox />} />
                <Route path="/cleaning" element={<Cleaning />} />
                <Route path="/consistency" element={<Consistency />} />
                <Route path="/walking" element={<Walking />} />
                <Route path="/notes" element={<Notes />} />
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
