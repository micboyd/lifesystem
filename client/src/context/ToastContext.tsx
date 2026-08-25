import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Toast, { type ToastVariant } from '../components/Toast'

/** One queued message. Named apart from the `Toast` component it renders into. */
interface ToastItem {
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
    const [toasts, setToasts] = useState<ToastItem[]>([])
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
            {/* Bottom-centre, above every overlay — modals, drawers and the
                portaled picker menus all sit at z-50/z-[100], so a toast
                reporting a failure inside one has to clear them. The stack is
                one live region, so a screen reader announces each arrival
                without the toasts fighting each other for it. */}
            <div
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 sm:p-6"
            >
                {toasts.map((t) => (
                    <Toast
                        key={t.id}
                        variant={t.variant}
                        duration={TIMEOUT}
                        onClose={() => dismiss(t.id)}
                        className="pointer-events-auto w-full max-w-sm"
                    >
                        {t.message}
                    </Toast>
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
