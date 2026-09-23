import { Card } from '../Card'
import Button from '../Button'
import { DAY_TYPE_LABELS, type EffectiveTargets } from '../../lib/nutritionTargets'
import type { WeekTarget } from '../../lib/nutritionWeek'
import { parseDateKey, WEEKDAYS_LONG } from '../../lib/calendar'
import { NUTRITION_PHASE_LABELS, type Macros, type NutritionPhase } from '../../types'

/**
 * The week's targets, laid out against the week's plan.
 *
 * The day cards say what's been added; this says what each day was meant to
 * hold — the phase's prescription for that date, shifted for how hard it
 * trains — and how far the plan still is from it. Planning a week without it
 * means adding meals and then doing the subtraction in your head.
 */

const MACRO_ROWS = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbs', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
] as const

type MacroKey = (typeof MACRO_ROWS)[number]['key']

/** Close enough to call the day planned — a plan is never exact to the gram. */
const ON_TARGET = 0.05

const n = (v: number) => Math.round(v).toLocaleString('en-GB')

/**
 * How the plan sits against one target. Protein is the exception to "over is a
 * problem": on a cut, overshooting it is the point.
 */
function gapTone(key: MacroKey, planned: number, target: number): 'on' | 'under' | 'over' {
    const gap = planned - target
    if (Math.abs(gap) <= target * ON_TARGET) return 'on'
    if (gap < 0) return 'under'
    return key === 'protein' ? 'on' : 'over'
}

const TONE_CLS = {
    on: 'text-emerald-600',
    under: 'text-neutral-400',
    over: 'text-amber-600',
} as const

function Gap({ k, planned, target }: { k: MacroKey; planned: number; target: number }) {
    const tone = gapTone(k, planned, target)
    const gap = Math.round(planned - target)
    return (
        <span className={`text-[10px] font-semibold tabular-nums ${TONE_CLS[tone]}`}>
            {tone === 'on' ? (
                <i className="fa-solid fa-check text-[9px]" aria-label="On target" />
            ) : (
                `${gap > 0 ? '+' : '−'}${n(Math.abs(gap))}`
            )}
        </span>
    )
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

export default function PlannerTargets({
    days,
    today,
    targets,
    planned,
    weekTarget,
    onOpenPhases,
}: {
    days: string[]
    today: string
    targets: Map<string, EffectiveTargets>
    /** Everything counted on each day — eaten and still planned. */
    planned: Map<string, Macros>
    weekTarget: WeekTarget | null
    onOpenPhases?: () => void
}) {
    const phases = phasesOfWeek(days, targets)
    const anyTarget = days.some((d) => targets.get(d)?.goals?.calories)
    const settingsDays = days.filter(
        (d) => targets.get(d)?.source === 'settings' && !targets.get(d)?.phase
    ).length
    const weekPlanned = days.reduce<Macros>(
        (sum, d) => {
            const m = planned.get(d)
            return m
                ? {
                      calories: sum.calories + m.calories,
                      protein: sum.protein + m.protein,
                      carbs: sum.carbs + m.carbs,
                      fat: sum.fat + m.fat,
                  }
                : sum
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    return (
        <Card as="section" flush hover={false} className="flex flex-col gap-4 p-4 sm:p-5">
            {/* Which prescription governs the week, and where it came from. */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Targets this week
                    </p>
                    {phases.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {phases.map(({ phase, from }, i) => {
                                const total = dayDiff(phase.startDate, phase.endDate) + 1
                                const dayN = dayDiff(phase.startDate, from) + 1
                                return (
                                    <p key={phase._id} className="text-sm text-neutral-700">
                                        {i > 0 && (
                                            <span className="mr-1 text-neutral-400">
                                                → from {shortDay(from)}
                                            </span>
                                        )}
                                        <span className="mr-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                                            {NUTRITION_PHASE_LABELS[phase.kind]}
                                        </span>
                                        <span className="font-semibold text-neutral-900">
                                            {phase.name}
                                        </span>
                                        <span className="ml-1.5 text-xs text-neutral-400">
                                            day {dayN} of {total}
                                        </span>
                                    </p>
                                )
                            })}
                        </div>
                    ) : (
                        <p className="mt-0.5 text-sm text-neutral-500">
                            {anyTarget
                                ? 'No nutrition phase covers this week — using your standing macro goals.'
                                : 'No targets for this week. Set up a nutrition phase to plan against.'}
                        </p>
                    )}
                    {phases.length > 0 && settingsDays > 0 && (
                        <p className="mt-1 text-xs text-neutral-400">
                            {settingsDays} day{settingsDays === 1 ? '' : 's'} outside the phase use
                            your standing goals.
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {weekTarget && (
                        <div className="text-right">
                            <p className="text-lg font-bold tabular-nums text-neutral-900">
                                {n(weekTarget.calories)}
                                <span className="ml-0.5 text-xs font-medium text-neutral-400">
                                    kcal week
                                </span>
                            </p>
                            <p className="text-[11px] tabular-nums text-neutral-400">
                                {n(weekTarget.calories / weekTarget.days)} avg/day
                                {weekTarget.days < days.length
                                    ? ` over ${weekTarget.days} days`
                                    : ''}
                            </p>
                        </div>
                    )}
                    {onOpenPhases && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="fa-solid fa-sliders"
                            onClick={onOpenPhases}
                        >
                            Phases
                        </Button>
                    )}
                </div>
            </div>

            {anyTarget && (
                <>
                    {/* Scrolls inside the card on a phone rather than pushing the page wide. */}
                    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                        <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left">
                            <thead>
                                <tr>
                                    <th className="w-20" />
                                    {days.map((date) => {
                                        const t = targets.get(date)
                                        return (
                                            <th
                                                key={date}
                                                className={`px-1.5 pb-2 text-center text-xs font-semibold ${
                                                    date === today
                                                        ? 'text-coral-600'
                                                        : 'text-neutral-700'
                                                }`}
                                            >
                                                {shortDay(date)}
                                                {t?.dayType && t.modifier !== 0 && (
                                                    <span
                                                        className="ml-1 rounded-full bg-neutral-100 px-1.5 py-px text-[9px] font-semibold text-neutral-500"
                                                        title={`${DAY_TYPE_LABELS[t.dayType]} day: ${
                                                            t.modifier > 0 ? '+' : '−'
                                                        }${Math.abs(t.modifier)} kcal`}
                                                    >
                                                        {t.modifier > 0 ? '+' : '−'}
                                                        {Math.abs(t.modifier)}
                                                    </span>
                                                )}
                                            </th>
                                        )
                                    })}
                                    <th className="border-l border-neutral-100 px-2 pb-2 text-center text-xs font-semibold text-neutral-900">
                                        Week
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {MACRO_ROWS.map(({ key, label, unit }) => {
                                    const weekGoal = weekTarget?.[key] ?? 0
                                    return (
                                        <tr key={key}>
                                            <th className="border-t border-neutral-100 py-1.5 pr-2 text-xs font-medium text-neutral-500">
                                                {label}
                                                <span className="ml-0.5 text-[10px] text-neutral-300">
                                                    {unit}
                                                </span>
                                            </th>
                                            {days.map((date) => {
                                                const goal = targets.get(date)?.goals?.[key]
                                                const got = planned.get(date)?.[key] ?? 0
                                                return (
                                                    <td
                                                        key={date}
                                                        className={`border-t border-neutral-100 px-1.5 py-1.5 text-center ${
                                                            date === today ? 'bg-coral-50/40' : ''
                                                        }`}
                                                    >
                                                        {goal ? (
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="text-xs font-semibold tabular-nums text-neutral-900">
                                                                    {n(goal)}
                                                                </span>
                                                                <Gap
                                                                    k={key}
                                                                    planned={got}
                                                                    target={goal}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-neutral-300">
                                                                —
                                                            </span>
                                                        )}
                                                    </td>
                                                )
                                            })}
                                            <td className="border-l border-t border-neutral-100 px-2 py-1.5 text-center">
                                                {weekGoal ? (
                                                    <div className="flex flex-col items-center leading-tight">
                                                        <span className="text-xs font-bold tabular-nums text-neutral-900">
                                                            {n(weekGoal)}
                                                        </span>
                                                        <Gap
                                                            k={key}
                                                            planned={weekPlanned[key]}
                                                            target={weekGoal}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-neutral-300">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                        Each figure is the day&apos;s target. Beneath it, how far the plan is from
                        it: <span className="font-semibold text-neutral-500">−</span> still to plan,{' '}
                        <span className="font-semibold text-amber-600">+</span> over,{' '}
                        <i
                            className="fa-solid fa-check text-[9px] text-emerald-600"
                            aria-hidden="true"
                        />{' '}
                        within 5%.
                    </p>
                </>
            )}
        </Card>
    )
}
