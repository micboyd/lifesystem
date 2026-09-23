import { type EffectiveTargets } from '../../lib/nutritionTargets'
import { parseDateKey, WEEKDAYS_LONG } from '../../lib/calendar'
import { NUTRITION_PHASE_LABELS, type NutritionPhase } from '../../types'
import { HeroChip } from '../planner/WeekPlannerUI'

/**
 * Which prescription governs the planner's week, for its hero: the phase (or
 * phases) the week runs through and how far in, or where the targets come from
 * when no phase covers it. Each day card then shows its own figures against
 * that day's target, so the week's targets no longer need a table of their own.
 */

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat'

/** Close enough to call the day planned — a plan is never exact to the gram. */
const ON_TARGET = 0.05

/**
 * How the plan sits against one target. Protein is the exception to "over is a
 * problem": on a cut, overshooting it is the point.
 */
export function gapTone(key: MacroKey, planned: number, target: number): 'on' | 'under' | 'over' {
    const gap = planned - target
    if (Math.abs(gap) <= target * ON_TARGET) return 'on'
    if (gap < 0) return 'under'
    return key === 'protein' ? 'on' : 'over'
}

/** Whole days between two YYYY-MM-DD keys. */
function dayDiff(from: string, to: string): number {
    const a = parseDateKey(from)
    const b = parseDateKey(to)
    return Math.round(
        (Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86_400_000
    )
}

function shortDay(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return WEEKDAYS_LONG[new Date(year, month, day).getDay()].slice(0, 3)
}

/** The phases the week runs through, in order, each with the first day it covers. */
function phasesOfWeek(days: string[], targets: Map<string, EffectiveTargets>) {
    const out: { phase: NutritionPhase; from: string }[] = []
    for (const date of days) {
        const phase = targets.get(date)?.phase
        if (phase && out[out.length - 1]?.phase._id !== phase._id) out.push({ phase, from: date })
    }
    return out
}

export default function PlannerPhase({
    days,
    targets,
    onOpenPhases,
}: {
    days: string[]
    targets: Map<string, EffectiveTargets>
    onOpenPhases?: () => void
}) {
    const phases = phasesOfWeek(days, targets)
    const anyTarget = days.some((d) => targets.get(d)?.goals?.calories)
    const settingsDays = days.filter(
        (d) => targets.get(d)?.source === 'settings' && !targets.get(d)?.phase
    ).length

    return (
        <div className="flex flex-wrap items-center gap-2">
            {phases.length > 0 ? (
                phases.map(({ phase, from }, i) => {
                    const total = dayDiff(phase.startDate, phase.endDate) + 1
                    const dayN = dayDiff(phase.startDate, from) + 1
                    return (
                        <HeroChip key={phase._id} className="max-w-full">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                                {NUTRITION_PHASE_LABELS[phase.kind]}
                            </span>
                            {i > 0 && <span className="text-white/60">from {shortDay(from)}</span>}
                            <span className="truncate">{phase.name}</span>
                            <span className="shrink-0 font-medium text-white/60">
                                day {dayN}/{total}
                            </span>
                        </HeroChip>
                    )
                })
            ) : (
                <span className="text-sm text-white/70">
                    {anyTarget
                        ? 'No phase this week — using your standing goals'
                        : 'No targets this week'}
                </span>
            )}
            {phases.length > 0 && settingsDays > 0 && (
                <span className="text-xs text-white/60">
                    +{settingsDays} day{settingsDays === 1 ? '' : 's'} on standing goals
                </span>
            )}
            {onOpenPhases && (
                <button
                    type="button"
                    onClick={onOpenPhases}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <i className="fa-solid fa-sliders text-[10px]" aria-hidden="true" />
                    {phases.length > 0 || anyTarget ? 'Phases' : 'Set up a phase'}
                </button>
            )}
        </div>
    )
}
