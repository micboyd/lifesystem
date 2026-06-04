import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import api from '../services/api'
import type { ApiResponse, LoginCredentials, LoginResponseData, User } from '../types'

interface AuthContextValue {
    user: User | null
    /** True while the initial session check (or a login request) is in flight. */
    loading: boolean
    login: (credentials: LoginCredentials) => Promise<void>
    logout: () => void
}

const TOKEN_KEY = 'token'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    // On mount, if we already hold a token, restore the session from /me.
    useEffect(() => {
        const token = localStorage.getItem(TOKEN_KEY)
        if (!token) {
            setLoading(false)
            return
        }
        api.get<ApiResponse<User>>('/users/me')
            .then((res) => setUser(res.data.data))
            .catch(() => localStorage.removeItem(TOKEN_KEY)) // stale/invalid token
            .finally(() => setLoading(false))
    }, [])

    async function login(credentials: LoginCredentials) {
        setLoading(true)
        try {
            const res = await api.post<ApiResponse<LoginResponseData>>('/users/login', credentials)
            localStorage.setItem(TOKEN_KEY, res.data.data.token)
            const me = await api.get<ApiResponse<User>>('/users/me')
            setUser(me.data.data)
        } finally {
            setLoading(false)
        }
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
    return ctx
}
