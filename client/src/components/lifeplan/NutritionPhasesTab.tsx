import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import Input from '../Input'
import Select from '../Select'
import Textarea from '../Textarea'
import Alert from '../Alert'
import Badge from '../Badge'
import EmptyState from '../EmptyState'
import DatePicker, { type DatePickerValue, type DateRange } from '../DatePicker'
import {
    NUTRITION_PHASE_KINDS,
    NUTRITION_PHASE_LABELS,
    type MacroGoals,
    type NutritionPhase,
    type NutritionPhaseInput,
    type NutritionPhaseKind,
} from '../../types'
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
    }
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
