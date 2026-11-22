import type {
    GoalMode,
    MacroRole,
    NutritionPhase,
    NutritionPhaseInput,
    NutritionPhaseKind,
    PhaseGoal,
} from '../../types'
import { DEFAULT_MACRO_POLICY, resolveGoalMode } from '../../lib/nutritionConfig'
import { todayKey } from '../../lib/calendar'
import { currentPhaseTargets } from '../../lib/nutrition'

/**
 * A nutrition plan as a form: every field a string while it's being typed,
 * and the mapping to and from the saved plan. Shared by the plan drawer and
 * the full-screen plan builder so the two can't drift.
 */

/** A number input's value as a target, treating a blank box as "no target". */
export function readNumber(value: string): number | undefined {
    if (!value.trim()) return undefined
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** A signed number input, where negatives are meaningful (rates). */
export function readSigned(value: string): number | undefined {
    if (!value.trim()) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

export interface FormState {
    name: string
    startDate: string
    endDate: string
    kind: NutritionPhaseKind
    calories: string
    protein: string
    carbs: string
    fat: string
    weeklyRate: string
    notes: string
    /**
     * The goal block. Switched on by `adaptive` — without it the phase is a
     * plain dated target, exactly as phases were before any of this existed.
     */
    adaptive: boolean
    goalMode: GoalMode
    startWeight: string
    startBodyFat: string
    targetWeight: string
    targetWeightMin: string
    targetWeightMax: string
    targetBodyFat: string
    rateMin: string
    rateMax: string
    proteinFloor: string
    cycling: boolean
    hardKcal: string
    restKcal: string
    /** Advanced review settings. Blank means "use the application default". */
    reviewWindowDays: string
    minimumDataDays: string
    preferredDataDays: string
    maxAdjustmentKcal: string
    adherenceTolerance: string
    proteinRole: MacroRole
    fatRole: MacroRole
    carbsRole: MacroRole
}

export function blankForm(): FormState {
    const today = todayKey()
    return {
        name: '',
        startDate: today,
        endDate: today,
        kind: 'cut',
        calories: '',
        protein: '',
        carbs: '',
        fat: '',
        weeklyRate: '',
        notes: '',
        adaptive: false,
        goalMode: 'weight-loss',
        startWeight: '',
        startBodyFat: '',
        targetWeight: '',
        targetWeightMin: '',
        targetWeightMax: '',
        targetBodyFat: '',
        rateMin: '',
        rateMax: '',
        proteinFloor: '',
        cycling: false,
        hardKcal: '',
        restKcal: '',
        reviewWindowDays: '',
        minimumDataDays: '',
        preferredDataDays: '',
        maxAdjustmentKcal: '',
        adherenceTolerance: '',
        proteinRole: DEFAULT_MACRO_POLICY.protein,
        fatRole: DEFAULT_MACRO_POLICY.fat,
        carbsRole: DEFAULT_MACRO_POLICY.carbs,
    }
}

export function formFrom(phase: NutritionPhase): FormState {
    return {
        name: phase.name,
        startDate: phase.startDate,
        endDate: phase.endDate,
        kind: phase.kind,
        // The targets in force now, not the opening set: saving an untouched
        // form must not read as a change back to where the plan started.
        calories: currentPhaseTargets(phase).calories?.toString() ?? '',
        protein: currentPhaseTargets(phase).protein?.toString() ?? '',
        carbs: currentPhaseTargets(phase).carbs?.toString() ?? '',
        fat: currentPhaseTargets(phase).fat?.toString() ?? '',
        weeklyRate: phase.weeklyRate?.toString() ?? '',
        notes: phase.notes ?? '',
        adaptive: phase.adaptive?.enabled ?? phase.goal?.adaptive ?? false,
        goalMode: resolveGoalMode(phase),
        startWeight: phase.goal?.startWeightKg?.toString() ?? '',
        startBodyFat: phase.goal?.startBodyFatPct?.toString() ?? '',
        targetWeight: phase.goal?.targetWeightKg?.toString() ?? '',
        targetWeightMin: phase.goal?.targetWeightRangeKg?.min?.toString() ?? '',
        targetWeightMax: phase.goal?.targetWeightRangeKg?.max?.toString() ?? '',
        targetBodyFat: phase.goal?.targetBodyFatPct?.toString() ?? '',
        rateMin: phase.goal?.acceptableWeeklyRateKg?.min?.toString() ?? '',
        rateMax: phase.goal?.acceptableWeeklyRateKg?.max?.toString() ?? '',
        proteinFloor: phase.goal?.proteinFloorG?.toString() ?? '',
        cycling: phase.strategy?.type === 'activity',
        hardKcal: phase.strategy?.hardKcal?.toString() ?? '',
        restKcal: phase.strategy?.restKcal?.toString() ?? '',
        reviewWindowDays: phase.adaptive?.reviewWindowDays?.toString() ?? '',
        minimumDataDays: phase.adaptive?.minimumDataDays?.toString() ?? '',
        preferredDataDays: phase.adaptive?.preferredDataDays?.toString() ?? '',
        maxAdjustmentKcal: phase.adaptive?.maxAdjustmentKcal?.toString() ?? '',
        adherenceTolerance: phase.adaptive?.calorieAdherenceToleranceKcal?.toString() ?? '',
        proteinRole: phase.macroPolicy?.protein ?? DEFAULT_MACRO_POLICY.protein,
        fatRole: phase.macroPolicy?.fat ?? DEFAULT_MACRO_POLICY.fat,
        carbsRole: phase.macroPolicy?.carbs ?? DEFAULT_MACRO_POLICY.carbs,
    }
}

/**
 * The goal block a form describes, or undefined when adaptive targeting is off.
 *
 * Kept out of the submit handler because the mapping is fiddly enough to be
 * worth reading on its own: a blank box means "not set", and a range is only a
 * range when both ends are filled in.
 */
export function goalFrom(form: FormState): PhaseGoal | undefined {
    if (!form.adaptive) return undefined

    const min = readSigned(form.rateMin)
    const max = readSigned(form.rateMax)
    const wMin = readNumber(form.targetWeightMin)
    const wMax = readNumber(form.targetWeightMax)

    return {
        // `style` predates `goalMode` and still drives older reads, so it is kept
        // in step rather than left to contradict the mode.
        style: form.goalMode === 'recomposition' ? 'recomp' : 'standard',
        startWeightKg: readNumber(form.startWeight),
        startBodyFatPct: readNumber(form.startBodyFat),
        targetDate: form.endDate,
        targetWeightKg: readNumber(form.targetWeight),
        targetWeightRangeKg:
            wMin !== undefined && wMax !== undefined ? { min: wMin, max: wMax } : undefined,
        targetBodyFatPct: readNumber(form.targetBodyFat),
        targetWeeklyRateKg: readSigned(form.weeklyRate),
        acceptableWeeklyRateKg: min !== undefined && max !== undefined ? { min, max } : undefined,
        proteinFloorG: readNumber(form.proteinFloor),
        adaptive: true,
    }
}

/** What each macro role means, in the words the editor uses. */
export const MACRO_ROLE_LABELS: Record<MacroRole, string> = {
    fixed: 'Hold',
    minimum: 'Floor',
    remainder: 'Remainder',
    adjustable: 'Scale',
}


/** The plan a filled-in form describes, ready to save. */
export function inputFrom(form: FormState): NutritionPhaseInput {
    return {
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        kind: form.kind,
        targets: {
            calories: readNumber(form.calories),
            protein: readNumber(form.protein),
            carbs: readNumber(form.carbs),
            fat: readNumber(form.fat),
        },
        weeklyRate: form.weeklyRate.trim() ? Number(form.weeklyRate) : undefined,
        goal: goalFrom(form),
        goalMode: form.goalMode,
        // Only the settings actually filled in are sent. A blank box means "use
        // the application default", which must not be frozen into the record.
        adaptive: form.adaptive
            ? {
                  enabled: true,
                  reviewWindowDays: readNumber(form.reviewWindowDays),
                  minimumDataDays: readNumber(form.minimumDataDays),
                  preferredDataDays: readNumber(form.preferredDataDays),
                  maxAdjustmentKcal: readNumber(form.maxAdjustmentKcal),
                  calorieAdherenceToleranceKcal: readNumber(form.adherenceTolerance),
              }
            : undefined,
        macroPolicy: { protein: form.proteinRole, fat: form.fatRole, carbs: form.carbsRole },
        strategy: form.cycling
            ? { type: 'activity', hardKcal: readNumber(form.hardKcal), restKcal: readNumber(form.restKcal) }
            : undefined,
        notes: form.notes.trim() ? form.notes.trim() : undefined,
    }
}
