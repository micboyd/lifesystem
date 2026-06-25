import { isMoneyHidden } from './moneyVisibility'

/** Placeholder shown in place of any amount while money is hidden. */
const MASK = '••••'

/** Format a number as a plain amount, e.g. 1234.5 → "1,234.50". */
export function formatAmount(n: number, decimals = 2): string {
    if (isMoneyHidden()) return MASK
    return n.toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })
}

/** Format a number as money with the sign outside the symbol, e.g. -503.4 → "-£503.40". */
export function formatMoney(n: number, decimals = 2): string {
    if (isMoneyHidden()) return `£${MASK}`
    const sign = n < 0 ? '-' : ''
    return `${sign}£${formatAmount(Math.abs(n), decimals)}`
}

/** Compact money for headline figures, e.g. 1_250_000 → "£1.25m". */
export function formatMoneyCompact(n: number): string {
    if (isMoneyHidden()) return `£${MASK}`
    if (n >= 1_000_000) return `£${formatAmount(n / 1_000_000, 2)}m`
    if (n >= 10_000) return `£${formatAmount(n / 1_000, 1)}k`
    return `£${formatAmount(n, 0)}`
}
