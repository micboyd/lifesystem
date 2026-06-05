/** "HH:MM" → minutes since midnight. */
export function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
}

/** minutes since midnight → "HH:MM". */
export function minutesToTime(mins: number): string {
    const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)))
    const h = Math.floor(clamped / 60)
    const m = clamped % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Duration in minutes → "1h 30m" / "45m" / "2h". */
export function formatDuration(mins: number): string {
    if (mins <= 0) return '0m'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
}

/** "HH:MM" (24h) → "7:00 AM". */
export function formatTime12(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const period = h < 12 ? 'AM' : 'PM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export const DEFAULT_WAKE = '07:00'
export const DEFAULT_BED = '23:00'
