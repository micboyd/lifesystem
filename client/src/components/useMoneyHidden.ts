import { useSyncExternalStore } from 'react'
import { isMoneyHidden, subscribeMoneyVisibility } from '../lib/moneyVisibility'

/**
 * Subscribe a component to the global "hide money" switch. Returns the current
 * state and, more importantly, re-renders the component when it flips so that
 * the `money.ts` formatters it calls produce masked output. Any component that
 * displays money should call this once.
 */
export function useMoneyHidden(): boolean {
    return useSyncExternalStore(subscribeMoneyVisibility, isMoneyHidden, isMoneyHidden)
}
