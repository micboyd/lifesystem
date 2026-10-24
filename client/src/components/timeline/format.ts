import type { AreaTone } from '../dashboard/DashSection'
import type { MilestoneKind } from '../../lib/timeline'
import type { NutritionPhaseKind } from '../../types'

/** Shared look and number formatting for the Timeline page. */

export const MILESTONE_STYLE: Record<MilestoneKind, { tone: AreaTone; icon: string }> = {
    plan: { tone: 'navy', icon: 'fa-solid fa-flag' },
    fat: { tone: 'coral', icon: 'fa-solid fa-fire' },
    muscle: { tone: 'violet', icon: 'fa-solid fa-dumbbell' },
    strength: { tone: 'amber', icon: 'fa-solid fa-arrow-trend-up' },
    water: { tone: 'sky', icon: 'fa-solid fa-droplet' },
    goal: { tone: 'green', icon: 'fa-solid fa-bullseye' },
    progress: { tone: 'green', icon: 'fa-solid fa-flag-checkered' },
}

export const PHASE_TONES: Record<NutritionPhaseKind, { label: string; dot: string; bar: string }> = {
    cut: { label: 'Cut', dot: 'bg-coral-500', bar: 'bg-coral-400' },
    maintain: { label: 'Maintenance', dot: 'bg-neutral-400', bar: 'bg-neutral-400' },
    gain: { label: 'Build', dot: 'bg-violet-500', bar: 'bg-violet-400' },
}

export function fmtDate(date: string, withYear = false): string {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        ...(withYear ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
    })
}

export function fmtNum(n: number, decimals: number): string {
    const f = Math.pow(10, decimals)
    return (Math.round(n * f) / f).toFixed(decimals)
}

/** Lifts to the nearest 2.5 kg — the smallest jump on most barbells. */
export function fmtLift(kg: number): string {
    const r = Math.round(kg / 2.5) * 2.5
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export function signed(n: number, decimals = 0): string {
    const s = fmtNum(Math.abs(n), decimals)
    if (Number(s) === 0) return s
    return n > 0 ? `+${s}` : `−${s}`
}

export function kcal(n: number): string {
    return (Math.round(n / 10) * 10).toLocaleString('en-GB')
}

/** "in 5 days", "in 3 weeks", "today". */
export function fromNow(today: string, date: string, days: number): string {
    if (date <= today) return 'This week'
    if (days < 14) return `In ${days} day${days === 1 ? '' : 's'}`
    const weeks = Math.round(days / 7)
    return weeks < 9 ? `In ${weeks} weeks` : `In ${Math.round(days / 30.4)} months`
}
