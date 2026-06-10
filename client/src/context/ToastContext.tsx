import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Alert from '../components/Alert'

type ToastVariant = 'info' | 'success' | 'warning' | 'danger'

interface Toast {
    id: number
    variant: ToastVariant
    message: string
}

interface ToastValue {
    /** Show a transient toast. Defaults to the danger variant — most callers are error paths. */
    show: (message: string, variant?: ToastVariant) => void
    /** Convenience for the common case: report a failed action. */
    error: (message: string) => void
}

const ToastContext = createContext<ToastValue | undefined>(undefined)

/** How long a toast stays on screen before auto-dismissing. */
const TIMEOUT = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const nextId = useRef(0)

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const show = useCallback(
        (message: string, variant: ToastVariant = 'danger') => {
            const id = nextId.current++
            setToasts((prev) => [...prev, { id, variant, message }])
            setTimeout(() => dismiss(id), TIMEOUT)
        },
        [dismiss]
    )

    const value = useMemo<ToastValue>(
        () => ({ show, error: (message) => show(message, 'danger') }),
        [show]
    )

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
                {toasts.map((t) => (
                    <div key={t.id} className="pointer-events-auto w-full max-w-sm shadow-lg">
                        <Alert variant={t.variant} onClose={() => dismiss(t.id)}>
                            {t.message}
                        </Alert>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export function useToast(): ToastValue {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within a ToastProvider')
    return ctx
}
