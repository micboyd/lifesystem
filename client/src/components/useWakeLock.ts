import { useEffect } from 'react'

/**
 * Keeps the phone's screen on while `active` — for logging a session in the
 * gym, where the screen locking mid-set or mid-run means unlocking to tap.
 *
 * The browser drops the lock whenever the page is hidden, so it's asked for
 * again each time the page comes back. Where the Wake Lock API isn't there
 * (older iOS, insecure origins) this quietly does nothing.
 */
export function useWakeLock(active: boolean) {
    useEffect(() => {
        if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
        let lock: WakeLockSentinel | null = null
        let live = true

        async function request() {
            if (document.visibilityState !== 'visible' || lock) return
            try {
                const next = await navigator.wakeLock.request('screen')
                if (!live) {
                    void next.release()
                    return
                }
                lock = next
                next.addEventListener('release', () => {
                    if (lock === next) lock = null
                })
            } catch {
                // Refused (low battery, not allowed) — the screen just sleeps as usual.
            }
        }

        void request()
        document.addEventListener('visibilitychange', request)
        return () => {
            live = false
            document.removeEventListener('visibilitychange', request)
            void lock?.release()
            lock = null
        }
    }, [active])
}
