import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import Input from '../components/Input'
import Button from '../components/Button'
import Alert from '../components/Alert'

export default function Login() {
    const { user, login, loading } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // Already signed in — bounce to where they were headed (or home).
    if (user) {
        const from = (location.state as { from?: string } | null)?.from ?? '/'
        return <Navigate to={from} replace />
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError('')
        setSubmitting(true)
        try {
            await login({ email, password })
            const from = (location.state as { from?: string } | null)?.from ?? '/'
            navigate(from, { replace: true })
        } catch (err) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data?.message ?? 'Something went wrong. Please try again.')
                : 'Something went wrong. Please try again.'
            setError(message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
            <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
                        Welcome back
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">Sign in to your account</p>
                </div>

                {error && (
                    <Alert variant="danger" className="mb-5">
                        {error}
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <Input
                        label="Email"
                        type="email"
                        icon="fa-solid fa-envelope"
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Input
                        label="Password"
                        type="password"
                        icon="fa-solid fa-lock"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <Button
                        type="submit"
                        fullWidth
                        disabled={submitting || loading}
                        className="mt-2"
                    >
                        {submitting ? 'Signing in…' : 'Sign in'}
                    </Button>
                </form>
            </div>
        </main>
    )
}
