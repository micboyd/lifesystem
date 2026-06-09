import axios from 'axios'

const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
    headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request if present
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// On a 401 (expired/invalid token), drop the stale token and bounce to login.
// We skip the redirect for the login request itself and when already on /login
// so a bad-credentials attempt doesn't trigger a reload loop.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status
        const url: string = error.config?.url ?? ''
        const isLoginRequest = url.includes('/users/login')
        if (status === 401 && !isLoginRequest) {
            localStorage.removeItem('token')
            if (window.location.pathname !== '/login') {
                window.location.assign('/login')
            }
        }
        return Promise.reject(error)
    }
)

export default api
