/**
 * Global "hide money" switch. A single master toggle (in the navbar) flips this
 * and every money value across the app is masked — the formatters in `money.ts`
 * consult `isMoneyHidden()`, and components subscribe via `useMoneyHidden` so
 * they re-render when it changes. The choice is remembered across reloads.
 *
 * This module is framework-agnostic (no React) so `money.ts` can read the flag
 * without pulling React into the formatting layer; the hook lives separately.
 */

const STORAGE_KEY = 'hideMoney'

function readInitial(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
        return false
    }
}

let hidden = readInitial()
const listeners = new Set<() => void>()

/** Whether money values are currently masked. */
export function isMoneyHidden(): boolean {
    return hidden
}

export function setMoneyHidden(next: boolean): void {
    if (next === hidden) return
    hidden = next
    try {
        if (next) localStorage.setItem(STORAGE_KEY, '1')
        else localStorage.removeItem(STORAGE_KEY)
    } catch {
        /* persistence is best-effort (private mode, blocked storage) */
    }
    listeners.forEach((notify) => notify())
}

export function toggleMoneyHidden(): void {
    setMoneyHidden(!hidden)
}

/** Subscribe to visibility changes. Returns an unsubscribe function. */
export function subscribeMoneyVisibility(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
