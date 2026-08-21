/**
 * Shared number formatting for the nutrition views.
 *
 * Small enough to feel like duplication is cheaper, but four components read the
 * same figures and a rate rendered "−0.2" in one place and "-0.20 kg/wk" in
 * another reads as two different measurements. One copy.
 */

/** Whole numbers plain, decimals to one place. */
export function fmt(n: number): string {
    const v = Number(n)
    if (!Number.isFinite(v)) return '0'
    return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** Rounded to the nearest whole calorie, with a thousands separator. */
export function kcal(n: number): string {
    return Math.round(n).toLocaleString()
}

/** A signed calorie figure — the sign is the whole message. */
export function signedKcal(n: number): string {
    const rounded = Math.round(n)
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString()}`
}

/** "101.4 kg" — one decimal, which is all a bathroom scale can honestly claim. */
export function kg(n: number): string {
    return `${n.toFixed(1)} kg`
}

/** "−0.21 kg/week", with a real minus sign. */
export function rate(kgPerWeek: number): string {
    const sign = kgPerWeek < 0 ? '−' : '+'
    return `${sign}${Math.abs(kgPerWeek).toFixed(2)} kg/week`
}

/** A signed weight change, e.g. "−1.6 kg". */
export function signedKg(n: number): string {
    const sign = n < 0 ? '−' : n > 0 ? '+' : ''
    return `${sign}${Math.abs(n).toFixed(1)} kg`
}

/** "31 May 2027". */
export function longDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ]
    return `${d} ${months[m - 1]} ${y}`
}

/** "31 May 27" — the compact form for tight rows. */
export function shortDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${d} ${months[m - 1]} ${String(y).slice(2)}`
}

/** A rate band read aloud, e.g. "−0.30 → −0.15 kg/week". */
export function rateBand(min: number, max: number): string {
    const one = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`
    return `${one(min)} → ${one(max)} kg/week`
}
