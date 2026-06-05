import { Routes, Route, Outlet } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import Day from './pages/Day'
import Timebox from './pages/Timebox'
import Habits from './pages/Habits'
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
                <Route path="/profile" element={<Profile />} />
                <Route path="/styleguide" element={<StyleGuide />} />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    )
}
