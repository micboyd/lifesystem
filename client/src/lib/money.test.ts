import { describe, it, expect, afterEach } from 'vitest'
import { formatAmount, formatMoney, formatMoneyCompact } from './money'
import { setMoneyHidden } from './moneyVisibility'

// The formatters consult a global "hide money" flag; keep it off unless a test
// deliberately turns it on, and always restore it afterwards.
afterEach(() => setMoneyHidden(false))

describe('formatAmount', () => {
    it('groups thousands and pads to two decimals by default', () => {
        expect(formatAmount(1234.5)).toBe('1,234.50')
        expect(formatAmount(1000000)).toBe('1,000,000.00')
        expect(formatAmount(0)).toBe('0.00')
    })

    it('respects a custom decimal count', () => {
        expect(formatAmount(1234.5, 0)).toBe('1,235')
        expect(formatAmount(1234.567, 1)).toBe('1,234.6')
    })

    it('coerces null/undefined to zero', () => {
        expect(formatAmount(null as unknown as number)).toBe('0.00')
        expect(formatAmount(undefined as unknown as number)).toBe('0.00')
    })
})

describe('formatMoney', () => {
    it('puts the sign outside the currency symbol', () => {
        expect(formatMoney(503.4)).toBe('£503.40')
        expect(formatMoney(-503.4)).toBe('-£503.40')
    })

    it('treats zero as unsigned', () => {
        expect(formatMoney(0)).toBe('£0.00')
    })
})

describe('formatMoneyCompact', () => {
    it('abbreviates millions to two decimals', () => {
        expect(formatMoneyCompact(1_250_000)).toBe('£1.25m')
        expect(formatMoneyCompact(1_000_000)).toBe('£1.00m')
    })

    it('abbreviates ten-thousands-plus to one-decimal k', () => {
        expect(formatMoneyCompact(15_000)).toBe('£15.0k')
        expect(formatMoneyCompact(10_000)).toBe('£10.0k')
    })

    it('shows whole pounds below the k threshold', () => {
        expect(formatMoneyCompact(9_999)).toBe('£9,999')
        expect(formatMoneyCompact(0)).toBe('£0')
    })
})

describe('money masking', () => {
    it('masks amounts and money while hidden, keeping the £ on money', () => {
        setMoneyHidden(true)
        expect(formatAmount(1234.5)).toBe('••••')
        expect(formatMoney(1234.5)).toBe('£••••')
        expect(formatMoneyCompact(1_250_000)).toBe('£••••')
    })
})
