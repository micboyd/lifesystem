import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import Input from '../Input'
import Select from '../Select'
import Textarea from '../Textarea'
import Switch from '../Switch'
import Alert from '../Alert'
import Badge from '../Badge'
import EmptyState from '../EmptyState'
import DatePicker, { type DatePickerValue, type DateRange } from '../DatePicker'
import {
    GOAL_MODES,
    GOAL_MODE_LABELS,
    MACRO_ROLES,
    NUTRITION_PHASE_KINDS,
    NUTRITION_PHASE_LABELS,
    type MacroGoals,
    type NutritionPhase,
    type NutritionPhaseInput,
    type GoalMode,
    type MacroRole,
    type NutritionPhaseKind,
    type PhaseGoal,
} from '../../types'
import {
    DEFAULT_ADAPTIVE_SETTINGS,
    DEFAULT_MACRO_POLICY,
    resolveGoalMode,
} from '../../lib/nutritionConfig'
import { compositionTarget, goalImplication } from '../../lib/nutritionGoal'
import { formatDateShort, todayKey } from '../../lib/calendar'

/**
 * The phase library: dated stretches of eating with their own targets.
 *
 * Phases are authored here rather than in Nutrition because they're a planning
 * artifact — Nutrition owns what was eaten on a given day, and a phase is the
 * target that day is judged against. Day-precise on purpose: a cut rarely starts
 * on the 1st of a month.
 */

/** A number input's value as a target, treating a blank box as "no target". */
function readNumber(value: string): number | undefined {
    if (!value.trim()) return undefined
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** A signed number input, where negatives are meaningful (rates). */
function readSigned(value: string): number | undefined {
    if (!value.trim()) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

interface FormState {
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

function blankForm(): FormState {
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

function formFrom(phase: NutritionPhase): FormState {
    return {
        name: phase.name,
        startDate: phase.startDate,
        endDate: phase.endDate,
        kind: phase.kind,
        calories: phase.targets.calories?.toString() ?? '',
        protein: phase.targets.protein?.toString() ?? '',
        carbs: phase.targets.carbs?.toString() ?? '',
        fat: phase.targets.fat?.toString() ?? '',
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
function goalFrom(form: FormState): PhaseGoal | undefined {
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
        targetWeightRangeKg: wMin !== undefined && wMax !== undefined ? { min: wMin, max: wMax } : undefined,
        targetBodyFatPct: readNumber(form.targetBodyFat),
        targetWeeklyRateKg: readSigned(form.weeklyRate),
        acceptableWeeklyRateKg: min !== undefined && max !== undefined ? { min, max } : undefined,
        proteinFloorG: readNumber(form.proteinFloor),
        adaptive: true,
    }
}

/** What each macro role means, in the words the editor uses. */
const MACRO_ROLE_LABELS: Record<MacroRole, string> = {
    fixed: 'Hold',
    minimum: 'Floor',
    remainder: 'Remainder',
    adjustable: 'Scale',
}

const KIND_VARIANTS: Record<NutritionPhaseKind, 'danger' | 'outline' | 'success'> = {
    cut: 'danger',
    maintain: 'outline',
    gain: 'success',
}

/** The macros a phase actually sets, for the summary line. */
function targetSummary(targets: MacroGoals): string {
    const bits: string[] = []
    if (targets.calories) bits.push(`${targets.calories} kcal`)
    if (targets.protein) bits.push(`${targets.protein}g P`)
    if (targets.carbs) bits.push(`${targets.carbs}g C`)
    if (targets.fat) bits.push(`${targets.fat}g F`)
    return bits.length > 0 ? bits.join(' · ') : 'No targets set'
}

export default function NutritionPhasesTab({
    phases,
    saving,
    error,
    onSave,
    onDelete,
}: {
    phases: NutritionPhase[]
    saving: boolean
    error: string | null
    onSave: (input: NutritionPhaseInput, id?: string) => Promise<boolean>
    onDelete: (phase: NutritionPhase) => void
}) {
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<NutritionPhase | null>(null)
    const [form, setForm] = useState<FormState>(blankForm)
    const [showAdvanced, setShowAdvanced] = useState(false)

    /*
     * What the goal being typed actually implies, recomputed as it is typed.
     *
     * Purely informative. A weight-and-body-fat pair can quietly demand several
     * kilos of new lean mass, which is worth knowing before saving and is not a
     * reason to refuse the goal — nothing here can know what is achievable.
     */
    const implication = useMemo(() => {
        const startKg = readNumber(form.startWeight)
        const startBf = readNumber(form.startBodyFat)
        const targetBf = readNumber(form.targetBodyFat)
        if (startKg === undefined || startBf === undefined || targetBf === undefined) return null
        return goalImplication(
            compositionTarget(startKg, startBf, {
                targetBodyFatPct: targetBf,
                targetWeightKg: readNumber(form.targetWeight),
            })
        )
    }, [form.startWeight, form.startBodyFat, form.targetBodyFat, form.targetWeight])

    useEffect(() => {
        if (!open) return
        setForm(editing ? formFrom(editing) : blankForm())
    }, [open, editing])

    function startNew() {
        setEditing(null)
        setOpen(true)
    }

    function startEdit(phase: NutritionPhase) {
        setEditing(phase)
        setOpen(true)
    }

    async function submit() {
        const ok = await onSave(
            {
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
                // Only the settings actually filled in are sent. A blank box
                // means "use the application default", which must not be frozen
                // into the record as today's value.
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
                macroPolicy: {
                    protein: form.proteinRole,
                    fat: form.fatRole,
                    carbs: form.carbsRole,
                },
                strategy: form.cycling
                    ? {
                          type: 'activity',
                          hardKcal: readNumber(form.hardKcal),
                          restKcal: readNumber(form.restKcal),
                      }
                    : undefined,
                notes: form.notes.trim() ? form.notes.trim() : undefined,
            },
            editing?._id
        )
        if (ok) setOpen(false)
    }

    const rangeInvalid = form.startDate > form.endDate

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold tracking-tight text-neutral-950">
                        Nutrition phases
                    </h2>
                    <p className="text-sm text-neutral-500">
                        Dated targets the nutrition lane draws and adherence is judged against.
                    </p>
                </div>
                <Button icon="fa-solid fa-plus" onClick={startNew} size="sm">
                    New phase
                </Button>
            </div>

            {phases.length === 0 ? (
                <EmptyState
                    icon="fa-bowl-food"
                    title="No phases yet"
                    description="A phase is a stretch of eating with its own calorie and protein targets."
                    action={<Button onClick={startNew}>Add a phase</Button>}
                />
            ) : (
                <div className="space-y-3">
                    {phases.map((phase) => (
                        <div
                            key={phase._id}
                            className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white p-5"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate text-base font-bold text-neutral-950">
                                        {phase.name}
                                    </h3>
                                    <Badge variant={KIND_VARIANTS[phase.kind]}>
                                        {NUTRITION_PHASE_LABELS[phase.kind]}
                                    </Badge>
                                    {typeof phase.weeklyRate === 'number' && phase.weeklyRate !== 0 && (
                                        <Badge variant="outline">
                                            {phase.weeklyRate > 0 ? '+' : ''}
                                            {phase.weeklyRate} kg/wk
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-1 text-xs font-semibold text-neutral-400">
                                    {formatDateShort(phase.startDate)} → {formatDateShort(phase.endDate)}
                                </p>
                                <p className="mt-2 text-sm tabular-nums text-neutral-600">
                                    {targetSummary(phase.targets)}
                                </p>
                                {phase.notes && (
                                    <p className="mt-2 text-sm text-neutral-500">{phase.notes}</p>
                                )}
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    onClick={() => startEdit(phase)}
                                    aria-label={`Edit ${phase.name}`}
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                >
                                    <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(phase)}
                                    aria-label={`Delete ${phase.name}`}
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                >
                                    <i className="fa-solid fa-trash text-xs" aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Edit phase' : 'New phase'}
                footer={
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setOpen(false)} fullWidth>
                            Cancel
                        </Button>
                        <Button
                            onClick={submit}
                            disabled={saving || !form.name.trim() || rangeInvalid}
                            fullWidth
                        >
                            {saving ? 'Saving…' : 'Save phase'}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-5">
                    {error && <Alert variant="danger">{error}</Alert>}

                    <Input
                        label="Name"
                        placeholder="Autumn cut"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />

                    <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Runs
                        </p>
                        <DatePicker
                            mode="range"
                            value={{ start: form.startDate, end: form.endDate }}
                            onChange={(value: DatePickerValue) => {
                                const range = value as DateRange | null
                                if (!range) return
                                setForm((f) => ({
                                    ...f,
                                    startDate: range.start || f.startDate,
                                    // While a range is mid-selection the end comes back
                                    // empty; hold the start until the second click.
                                    endDate: range.end || range.start || f.endDate,
                                }))
                            }}
                        />
                    </div>

                    <Select
                        label="Kind"
                        options={NUTRITION_PHASE_KINDS.map((k) => ({
                            value: k,
                            label: NUTRITION_PHASE_LABELS[k],
                        }))}
                        value={form.kind}
                        onChange={(v) => setForm((f) => ({ ...f, kind: v as NutritionPhaseKind }))}
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Calories"
                            type="number"
                            min={0}
                            placeholder="2200"
                            value={form.calories}
                            onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))}
                        />
                        <Input
                            label="Protein (g)"
                            type="number"
                            min={0}
                            placeholder="180"
                            value={form.protein}
                            onChange={(e) => setForm((f) => ({ ...f, protein: e.target.value }))}
                        />
                        <Input
                            label="Carbs (g)"
                            type="number"
                            min={0}
                            value={form.carbs}
                            onChange={(e) => setForm((f) => ({ ...f, carbs: e.target.value }))}
                        />
                        <Input
                            label="Fat (g)"
                            type="number"
                            min={0}
                            value={form.fat}
                            onChange={(e) => setForm((f) => ({ ...f, fat: e.target.value }))}
                        />
                    </div>

                    <Input
                        label="Weekly rate (kg)"
                        type="number"
                        step="0.1"
                        placeholder="-0.5"
                        hint="Signed: negative for a cut, positive for a gain."
                        value={form.weeklyRate}
                        onChange={(e) => setForm((f) => ({ ...f, weeklyRate: e.target.value }))}
                    />

                    {/*
                      Adaptive targeting. Off by default and entirely optional:
                      a phase without it behaves exactly as phases always have,
                      and the review engine stays quiet because it has nothing to
                      steer towards.
                    */}
                    <div className="rounded-2xl border border-neutral-200 p-4">
                        <Switch
                            label="Adaptive targets"
                            checked={form.adaptive}
                            onChange={(checked: boolean) => setForm((f) => ({ ...f, adaptive: checked }))}
                        />
                        <p className="mt-1.5 text-[11px] text-neutral-400">
                            Track a goal weight and let the review suggest calorie changes from your
                            weight trend. Nothing changes without your say-so.
                        </p>

                        {form.adaptive && (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <Select
                                        label="Goal type"
                                        options={GOAL_MODES.map((m) => ({
                                            value: m,
                                            label: GOAL_MODE_LABELS[m],
                                        }))}
                                        value={form.goalMode}
                                        onChange={(v) =>
                                            setForm((f) => ({ ...f, goalMode: v as GoalMode }))
                                        }
                                    />
                                    <p className="mt-1.5 text-[11px] text-neutral-400">
                                        What the goal is for. Recomposition reads a flat scale with a
                                        falling waist as success rather than a stall.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="Start weight (kg)"
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        placeholder="103"
                                        value={form.startWeight}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, startWeight: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Starting body fat (%)"
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        placeholder="28.8"
                                        value={form.startBodyFat}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, startBodyFat: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Target weight (kg)"
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        placeholder="95"
                                        value={form.targetWeight}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, targetWeight: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Acceptable from (kg)"
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        placeholder="94"
                                        value={form.targetWeightMin}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, targetWeightMin: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Acceptable to (kg)"
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        placeholder="96"
                                        value={form.targetWeightMax}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, targetWeightMax: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Target body fat (%)"
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        placeholder="20"
                                        value={form.targetBodyFat}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, targetBodyFat: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Protein floor (g)"
                                        type="number"
                                        min={0}
                                        placeholder="210"
                                        hint="Held flat when calories move."
                                        value={form.proteinFloor}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, proteinFloor: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Rate band from (kg/wk)"
                                        type="number"
                                        step="0.05"
                                        placeholder="-0.3"
                                        value={form.rateMin}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, rateMin: e.target.value }))
                                        }
                                    />
                                    <Input
                                        label="Rate band to (kg/wk)"
                                        type="number"
                                        step="0.05"
                                        placeholder="-0.15"
                                        value={form.rateMax}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, rateMax: e.target.value }))
                                        }
                                    />
                                </div>
                                <p className="text-[11px] text-neutral-400">
                                    The band is the range of weekly change that needs no correction.
                                    Signed throughout: loss is negative, gain positive, maintenance
                                    around zero. The weekly rate above is its centre.
                                </p>

                                {/* Non-blocking: says what the pairing implies, never refuses it. */}
                                {implication && (
                                    <p className="rounded-xl bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-500">
                                        {implication}
                                    </p>
                                )}

                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvanced((v) => !v)}
                                        className="text-[11px] font-semibold text-neutral-500 underline"
                                    >
                                        {showAdvanced ? 'Hide' : 'Show'} advanced settings
                                    </button>

                                    {showAdvanced && (
                                        <div className="mt-3 space-y-4">
                                            <p className="text-[11px] text-neutral-400">
                                                Leave any of these blank to use the application
                                                default, shown as the placeholder.
                                            </p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <Input
                                                    label="Review window (days)"
                                                    type="number"
                                                    min={1}
                                                    placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.reviewWindowDays)}
                                                    value={form.reviewWindowDays}
                                                    onChange={(e) =>
                                                        setForm((f) => ({ ...f, reviewWindowDays: e.target.value }))
                                                    }
                                                />
                                                <Input
                                                    label="Max adjustment (kcal)"
                                                    type="number"
                                                    min={0}
                                                    placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.maxAdjustmentKcal)}
                                                    value={form.maxAdjustmentKcal}
                                                    onChange={(e) =>
                                                        setForm((f) => ({ ...f, maxAdjustmentKcal: e.target.value }))
                                                    }
                                                />
                                                <Input
                                                    label="Minimum data (days)"
                                                    type="number"
                                                    min={1}
                                                    placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.minimumDataDays)}
                                                    value={form.minimumDataDays}
                                                    onChange={(e) =>
                                                        setForm((f) => ({ ...f, minimumDataDays: e.target.value }))
                                                    }
                                                />
                                                <Input
                                                    label="Days before advising"
                                                    type="number"
                                                    min={1}
                                                    placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.preferredDataDays)}
                                                    value={form.preferredDataDays}
                                                    onChange={(e) =>
                                                        setForm((f) => ({ ...f, preferredDataDays: e.target.value }))
                                                    }
                                                />
                                                <Input
                                                    label="Adherence tolerance (kcal)"
                                                    type="number"
                                                    min={0}
                                                    placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.calorieAdherenceToleranceKcal)}
                                                    value={form.adherenceTolerance}
                                                    onChange={(e) =>
                                                        setForm((f) => ({ ...f, adherenceTolerance: e.target.value }))
                                                    }
                                                />
                                            </div>

                                            <div>
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                                    When calories change
                                                </p>
                                                <div className="grid grid-cols-3 gap-3">
                                                    {(
                                                        [
                                                            ['proteinRole', 'Protein'],
                                                            ['fatRole', 'Fat'],
                                                            ['carbsRole', 'Carbs'],
                                                        ] as const
                                                    ).map(([key, label]) => (
                                                        <Select
                                                            key={key}
                                                            label={label}
                                                            options={MACRO_ROLES.map((r) => ({
                                                                value: r,
                                                                label: MACRO_ROLE_LABELS[r],
                                                            }))}
                                                            value={form[key]}
                                                            onChange={(v) =>
                                                                setForm((f) => ({ ...f, [key]: v as MacroRole }))
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                                <p className="mt-1.5 text-[11px] text-neutral-400">
                                                    Exactly one macro should take the remainder — it
                                                    absorbs the change when calories move.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Optional calorie cycling. The week still averages the baseline. */}
                    <div className="rounded-2xl border border-neutral-200 p-4">
                        <Switch
                            label="Cycle calories by training day"
                            checked={form.cycling}
                            onChange={(checked: boolean) => setForm((f) => ({ ...f, cycling: checked }))}
                        />
                        <p className="mt-1.5 text-[11px] text-neutral-400">
                            Shift the daily target by how hard the fitness planner says the day
                            trains. Carbohydrate absorbs the difference, so the week still averages
                            the baseline.
                        </p>
                        {form.cycling && (
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <Input
                                    label="Hard day (+kcal)"
                                    type="number"
                                    min={0}
                                    placeholder="100"
                                    value={form.hardKcal}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, hardKcal: e.target.value }))
                                    }
                                />
                                <Input
                                    label="Rest day (−kcal)"
                                    type="number"
                                    min={0}
                                    placeholder="150"
                                    value={form.restKcal}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, restKcal: e.target.value }))
                                    }
                                />
                            </div>
                        )}
                    </div>

                    <Textarea
                        label="Notes"
                        rows={2}
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                </div>
            </Modal>
        </div>
    )
}
