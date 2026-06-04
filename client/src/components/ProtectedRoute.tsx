import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from './Spinner'

/**
 * Wraps routes that require a signed-in user. While the initial session check
 * runs we render a spinner; unauthenticated users are sent to /login with the
 * attempted path so they can be returned there after signing in.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth()
    const location = useLocation()

    if (loading) {
        return (
            <div className="grid min-h-[calc(100vh-4rem)] place-items-center bg-neutral-50">
                <Spinner />
            </div>
        )
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />
    }

    return <>{children}</>
}
