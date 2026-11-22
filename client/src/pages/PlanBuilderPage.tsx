import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import ConfirmModal from '../components/ConfirmModal'
import Input from '../components/Input'
import DatePicker from '../components/DatePicker'
import { FIELD_LABEL } from '../components/fieldStyles'
import Select from '../components/Select'
import Switch from '../components/Switch'
import Textarea from '../components/Textarea'
import { BarButton, CAPS, DoneTick, Eyebrow, SectionTitle } from '../components/Blok'
import MealWeekBuilder from '../components/nutrition/MealWeekBuilder'
import { sortMenu } from '../lib/planMenu'
import { fmt, shortDate } from '../components/nutrition/format'
import {
    MACRO_ROLE_LABELS,
    blankForm,
    formFrom,
    inputFrom,
    readNumber,
    type FormState,
} from '../components/nutrition/planForm'
import { useToast } from '../context/ToastContext'
import { listMeals } from '../services/meals'
import * as planService from '../services/nutritionPhases'
import { normGoals } from '../lib/nutrition'
import { DEFAULT_ADAPTIVE_SETTINGS } from '../lib/nutritionConfig'
import { compositionTarget, goalImplication } from '../lib/nutritionGoal'
import { todayKey } from '../lib/calendar'
import { caloriesFromMacros } from '../components/nutrition/mealUi'
import {
    GOAL_MODES,
    GOAL_MODE_LABELS,
    MACRO_ROLES,
    NUTRITION_PHASE_LABELS,
    type GoalMode,
    type MacroRole,
    type Meal,
    type MenuApplied,
    type MenuItem,
    type NutritionPhase,
    type NutritionPhaseKind,
} from '../types'

/**
 * Nutrition → Plans → New plan, full screen: a five-step builder.
 *
 * About (name, dates, direction) → Targets (daily macros, rate, cycling) →
 * Goal (optional: where it's heading and the adaptive review) → Meals (the
 * repeating week, filled to the targets) → Review (create, and optionally put
 * it on the planner). Nothing is saved until Create; the draft survives a
 * refresh in session storage.
 */

const ICON_BTN =
    'grid h-11 w-11 shrink-0 place-items-center text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 lg:h-10 lg:w-10'

const STEPS = ['about', 'targets', 'goal', 'meals', 'review'] as const
type Step = (typeof STEPS)[number]
const STEP_LABELS: Record<Step, string> = {
    about: 'About',
    targets: 'Targets',
    goal: 'Goal',
    meals: 'Meals',
    review: 'Review',
}

const KIND_CHOICES: { kind: NutritionPhaseKind; icon: string; line: string }[] = [
    { kind: 'cut', icon: 'fa-solid fa-arrow-trend-down', line: 'Eat under maintenance to lose fat.' },
    { kind: 'maintain', icon: 'fa-solid fa-equals', line: 'Hold your weight steady.' },
    { kind: 'gain', icon: 'fa-solid fa-arrow-trend-up', line: 'Eat over maintenance to build.' },
]

const LENGTHS = [4, 8, 12, 16]

const DRAFT_KEY = 'nutrition.planDraft'
type Draft = { form: FormState; menu: MenuItem[]; step: Step; putOn: boolean; from: string }

function readDraft(): Draft | null {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        return raw ? (JSON.parse(raw) as Draft) : null
    } catch {
        return null
    }
}
function writeDraft(d: Draft | null) {
    try {
        if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
        else sessionStorage.removeItem(DRAFT_KEY)
    } catch {
        /* not kept */
    }
}

function errorMessage(err: unknown, fallback: string): string {
    return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

/** YYYY-MM-DD plus some days. */
function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

function lengthLabel(start: string, end: string): string {
    const days = daysBetween(start, end) + 1
    if (days < 1) return ''
    const weeks = days / 7
    return Number.isInteger(weeks) ? `${weeks} week${weeks === 1 ? '' : 's'}` : `${days} days`
}

/**
 * New plan (`/nutrition/plans/new`) or an existing one (`/nutrition/plans/:id/edit`).
 * An edit loads the plan and what of it is on the planner, then hands over.
 */
export default function PlanBuilderPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [editing, setEditing] = useState<{ plan: NutritionPhase; applied: MenuApplied } | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)

    useEffect(() => {
        if (!id) return
        let live = true
        Promise.all([planService.listNutritionPhases(), planService.getMenuApplied(id)])
            .then(([plans, applied]) => {
                if (!live) return
                const plan = plans.find((p) => p._id === id)
                if (plan) setEditing({ plan, applied })
                else setLoadError('That plan no longer exists.')
            })
            .catch((err) => live && setLoadError(errorMessage(err, 'Could not load the plan.')))
        return () => {
            live = false
        }
    }, [id])

    if (!id) return <Builder editing={null} />
    if (loadError) {
        return (
            <div className="mx-auto max-w-xl px-5 py-16">
                <Alert variant="danger">{loadError}</Alert>
                <div className="mt-6">
                    <BarButton onClick={() => navigate('/nutrition?tab=plans')}>Back to Plans</BarButton>
                </div>
            </div>
        )
    }
    if (!editing) {
        return (
            <div className="grid min-h-dvh place-items-center bg-canvas">
                <Spinner />
            </div>
        )
    }
    return <Builder key={editing.plan._id} editing={editing} />
}

function Builder({ editing }: { editing: { plan: NutritionPhase; applied: MenuApplied } | null }) {
    const navigate = useNavigate()
    const toast = useToast()
    const isEdit = !!editing
    // A draft is only kept for a new plan; an edit always starts from what's saved.
    const [draft] = useState(() => (isEdit ? null : readDraft()))
    const [initial] = useState(() => ({
        form: editing ? formFrom(editing.plan) : (draft?.form ?? newForm()),
        menu: editing ? sortMenu(editing.plan.menu ?? []) : (draft?.menu ?? []),
    }))

    const [form, setFormState] = useState<FormState>(initial.form)
    const [menu, setMenu] = useState<MenuItem[]>(initial.menu)
    const [step, setStepState] = useState<Step>(() => draft?.step ?? 'about')
    const [putOn, setPutOn] = useState(() => (editing ? editing.applied.count > 0 : (draft?.putOn ?? true)))
    const [from, setFrom] = useState(() => draft?.from ?? '')
    const [meals, setMeals] = useState<Meal[] | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirmLeave, setConfirmLeave] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)

    useEffect(() => {
        listMeals()
            .then(setMeals)
            .catch(() => setMeals([]))
    }, [])

    useEffect(() => {
        if (!isEdit) writeDraft({ form, menu, step, putOn, from })
    }, [isEdit, form, menu, step, putOn, from])

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setFormState((f) => ({ ...f, [key]: value }))

    const setStep = (s: Step) => {
        setStepState(s)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const aboutOk = form.name.trim().length > 0 && !!form.startDate && !!form.endDate && form.startDate <= form.endDate
    const goals = normGoals({
        calories: readNumber(form.calories),
        protein: readNumber(form.protein),
        carbs: readNumber(form.carbs),
        fat: readNumber(form.fat),
    })
    const macroKcal =
        readNumber(form.protein) !== undefined || readNumber(form.carbs) !== undefined || readNumber(form.fat) !== undefined
            ? caloriesFromMacros({
                  protein: readNumber(form.protein) ?? 0,
                  carbs: readNumber(form.carbs) ?? 0,
                  fat: readNumber(form.fat) ?? 0,
              })
            : null
    const kcalTyped = readNumber(form.calories)
    const kcalOff = macroKcal !== null && macroKcal > 0 && (kcalTyped === undefined || Math.abs(kcalTyped - macroKcal) > 50)

    const implication = useMemo(() => {
        const startKg = readNumber(form.startWeight)
        const startBf = readNumber(form.startBodyFat)
        const targetBf = readNumber(form.targetBodyFat)
        if (startKg === undefined || startBf === undefined || targetBf === undefined) return null
        return goalImplication(
            compositionTarget(startKg, startBf, { targetBodyFatPct: targetBf, targetWeightKg: readNumber(form.targetWeight) })
        )
    }, [form.startWeight, form.startBodyFat, form.targetBodyFat, form.targetWeight])

    const today = todayKey()
    const defaultFrom = form.startDate > today ? form.startDate : today
    const applyFrom = from && from >= form.startDate && from <= form.endDate ? from : defaultFrom
    const applyPossible = menu.length > 0 && applyFrom <= form.endDate

    const dirty = isEdit
        ? JSON.stringify(form) !== JSON.stringify(initial.form) || JSON.stringify(menu) !== JSON.stringify(initial.menu)
        : form.name.trim() !== '' || menu.length > 0 || form.calories !== '' || form.protein !== ''
    const onPlanner = editing?.applied.count ?? 0
    const leave = () => {
        if (!isEdit) writeDraft(null)
        navigate('/nutrition?tab=plans')
    }

    async function create() {
        setSaving(true)
        setError(null)
        let id: string | null = null
        try {
            const plan = editing
                ? await planService.updateNutritionPhase(editing.plan._id, inputFrom(form))
                : await planService.createNutritionPhase(inputFrom(form))
            id = plan._id
            // An edit always saves the week, so emptying it sticks too.
            if (menu.length || editing) await planService.saveMenu(id, menu)
            let note = ''
            if (putOn && applyPossible) {
                const out = await planService.applyMenu(id, applyFrom)
                note = ` · ${out.added} meals on the planner from ${shortDate(out.from)}`
            }
            if (!isEdit) writeDraft(null)
            toast.show(`${isEdit ? 'Saved' : 'Created'} ${plan.name}${note}`, 'success')
            navigate('/nutrition?tab=plans')
        } catch (err) {
            if (id) {
                // The plan is saved; only the meals or the planner step failed. Carry on from its own page.
                if (!isEdit) writeDraft(null)
                toast.show(errorMessage(err, 'Plan saved, but its meal week didn’t finish saving.'), 'warning')
                navigate(`/nutrition/plans/${id}/menu`)
                return
            }
            setError(errorMessage(err, isEdit ? 'Could not save the plan.' : 'Could not create the plan.'))
        } finally {
            setSaving(false)
        }
    }

    const statusOf: Record<Step, string> = {
        about: aboutOk ? `${NUTRITION_PHASE_LABELS[form.kind]} · ${lengthLabel(form.startDate, form.endDate)}` : 'Name & dates',
        targets: goals?.calories ? `${fmt(goals.calories)} kcal` : goals ? 'Macros set' : 'Daily macros',
        goal: form.adaptive ? (readNumber(form.targetWeight) ? `To ${form.targetWeight} kg` : 'Adaptive on') : 'Optional',
        meals: menu.length ? `${menu.length} meals` : 'Fill the week',
        review: isEdit ? 'Save' : 'Create',
    }
    const doneOf: Record<Step, boolean> = {
        about: aboutOk,
        targets: !!goals,
        goal: form.adaptive,
        meals: menu.length > 0,
        review: false,
    }

    const at = STEPS.indexOf(step)
    const prev = at > 0 ? STEPS[at - 1] : null
    const next = at < STEPS.length - 1 ? STEPS[at + 1] : null
    const blocked = step === 'about' && !aboutOk

    return (
        <div className="flex min-h-dvh flex-col bg-canvas">
            {/* Top: the way out, the name, and the five steps. */}
            <div className="sticky top-0 z-20 bg-canvas pt-[env(safe-area-inset-top)]">
                <div className="flex min-h-16 items-center gap-3 border-b border-hairline px-3 sm:px-8">
                    <button
                        type="button"
                        onClick={() => (dirty ? setConfirmLeave(true) : leave())}
                        aria-label="Close the plan builder"
                        className={ICON_BTN}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className={`${CAPS} hidden text-neutral-500 sm:block`}>Nutrition · {isEdit ? 'edit plan' : 'new plan'}</p>
                        <h1 className="truncate text-[17px] font-medium">{form.name.trim() || (isEdit ? 'Untitled plan' : 'New plan')}</h1>
                    </div>
                </div>
                <div className="mx-auto max-w-5xl sm:px-8">
                    <nav aria-label="Plan steps" className="grid grid-cols-5 border-b border-hairline">
                        {STEPS.map((s, n) => {
                            const on = s === step
                            const reachable = n <= at || aboutOk
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    aria-current={on ? 'step' : undefined}
                                    disabled={!reachable}
                                    onClick={() => setStep(s)}
                                    className={`-mb-px flex min-w-0 flex-col gap-1 border-b-2 px-2 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 ${
                                        on ? 'border-neutral-900' : 'border-transparent hover:bg-neutral-50'
                                    } ${n > 0 ? 'border-l border-l-hairline' : ''}`}
                                >
                                    <span className="flex items-center gap-2">
                                        {doneOf[s] && !on ? (
                                            <DoneTick size={18} />
                                        ) : (
                                            <span
                                                className={`grid h-[18px] w-[18px] shrink-0 place-items-center text-[11px] font-medium tabular-nums ${
                                                    on ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
                                                }`}
                                            >
                                                {n + 1}
                                            </span>
                                        )}
                                        <span className={`${CAPS} hidden truncate sm:inline ${on ? 'text-neutral-900' : 'text-neutral-600'}`}>
                                            {STEP_LABELS[s]}
                                        </span>
                                    </span>
                                    <span className={`${CAPS} truncate sm:hidden ${on ? 'text-neutral-900' : 'text-neutral-600'}`}>
                                        {STEP_LABELS[s]}
                                    </span>
                                    <span className="hidden truncate text-[12px] text-neutral-500 sm:block sm:text-[13px]">
                                        {statusOf[s]}
                                    </span>
                                </button>
                            )
                        })}
                    </nav>
                </div>
            </div>

            <main
                className={`mx-auto w-full flex-1 px-5 pb-36 pt-10 sm:px-8 sm:pt-14 ${step === 'meals' ? 'max-w-[1800px]' : 'max-w-3xl'}`}
            >
                {step === 'about' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={1} title="What’s this plan?">
                            A name, when it runs, and which way the scale should go.
                        </StepHead>
                        <Input
                            label="Name"
                            placeholder="Winter cut"
                            value={form.name}
                            autoFocus
                            onChange={(e) => set('name', e.target.value)}
                        />
                        <div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <span className={FIELD_LABEL}>Starts</span>
                                    <DatePicker
                                        value={form.startDate || null}
                                        clearable={false}
                                        onChange={(v) => typeof v === 'string' && set('startDate', v)}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className={FIELD_LABEL}>Ends</span>
                                    <DatePicker
                                        value={form.endDate || null}
                                        minDate={form.startDate || undefined}
                                        clearable={false}
                                        onChange={(v) => typeof v === 'string' && set('endDate', v)}
                                    />
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="text-[13px] text-neutral-500">Run for</span>
                                {LENGTHS.map((w) => {
                                    const end = addDays(form.startDate, w * 7 - 1)
                                    const on = form.endDate === end
                                    return (
                                        <button
                                            key={w}
                                            type="button"
                                            onClick={() => set('endDate', end)}
                                            className={`h-9 border px-3 text-[13px] transition-colors ${
                                                on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                                            }`}
                                        >
                                            {w} weeks
                                        </button>
                                    )
                                })}
                                {form.startDate <= form.endDate && (
                                    <span className="text-[13px] text-neutral-500">· {lengthLabel(form.startDate, form.endDate)}</span>
                                )}
                            </div>
                            {form.startDate > form.endDate && (
                                <p className="mt-2 text-[13px] text-red-700">The end is before the start.</p>
                            )}
                        </div>
                        <div>
                            <p className={`${CAPS} mb-2 text-neutral-600`}>Direction</p>
                            <div role="radiogroup" aria-label="Direction" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                {KIND_CHOICES.map((c) => {
                                    const on = form.kind === c.kind
                                    return (
                                        <button
                                            key={c.kind}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            onClick={() => set('kind', c.kind)}
                                            className={`flex items-start gap-3 border p-4 text-left transition-colors ${
                                                on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                                            }`}
                                        >
                                            <i className={`${c.icon} mt-0.5 text-[15px]`} aria-hidden="true" />
                                            <span>
                                                <span className="block text-[15px] font-medium">{NUTRITION_PHASE_LABELS[c.kind]}</span>
                                                <span className={`block text-[13px] ${on ? 'text-neutral-300' : 'text-neutral-500'}`}>
                                                    {c.line}
                                                </span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                    </section>
                )}

                {step === 'targets' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={2} title="Daily targets">
                            What every day of the plan aims for. The planner, Stats and the meal week all measure against
                            these. Leave any blank for no target on it.
                        </StepHead>
                        <div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <Input label="Calories" type="number" min={0} placeholder="2200" value={form.calories} onChange={(e) => set('calories', e.target.value)} />
                                <Input label="Protein (g)" type="number" min={0} placeholder="180" value={form.protein} onChange={(e) => set('protein', e.target.value)} />
                                <Input label="Carbs (g)" type="number" min={0} placeholder="220" value={form.carbs} onChange={(e) => set('carbs', e.target.value)} />
                                <Input label="Fat (g)" type="number" min={0} placeholder="65" value={form.fat} onChange={(e) => set('fat', e.target.value)} />
                            </div>
                            {macroKcal !== null && macroKcal > 0 && (
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-neutral-600">
                                    <span>
                                        Those macros come to <span className="font-medium tabular-nums text-neutral-900">{fmt(macroKcal)} kcal</span>
                                        {kcalTyped !== undefined && kcalOff && ` — ${fmt(Math.abs(kcalTyped - macroKcal))} ${kcalTyped > macroKcal ? 'under' : 'over'} the calories`}
                                        .
                                    </span>
                                    {kcalOff && (
                                        <button
                                            type="button"
                                            onClick={() => set('calories', String(macroKcal))}
                                            className="font-medium text-neutral-900 underline"
                                        >
                                            Use {fmt(macroKcal)}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <Input
                            label="Weekly rate (kg)"
                            type="number"
                            step="0.1"
                            placeholder={form.kind === 'cut' ? '-0.5' : form.kind === 'gain' ? '0.25' : '0'}
                            hint="How fast the scale should move. Negative for a cut, positive for a gain."
                            value={form.weeklyRate}
                            onChange={(e) => set('weeklyRate', e.target.value)}
                        />
                        <Block>
                            <Switch label="Cycle calories by training day" checked={form.cycling} onChange={(v: boolean) => set('cycling', v)} />
                            <p className="mt-1.5 text-[13px] text-neutral-500">
                                More on hard training days, less on rest days, from the fitness planner. Carbs take the
                                difference, so the week still averages the target.
                            </p>
                            {form.cycling && (
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <Input label="Hard day (+kcal)" type="number" min={0} placeholder="100" value={form.hardKcal} onChange={(e) => set('hardKcal', e.target.value)} />
                                    <Input label="Rest day (−kcal)" type="number" min={0} placeholder="150" value={form.restKcal} onChange={(e) => set('restKcal', e.target.value)} />
                                </div>
                            )}
                        </Block>
                    </section>
                )}

                {step === 'goal' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={3} title="Where is it heading?">
                            Optional. Give the plan a goal and the review will watch your weigh-in trend and suggest
                            calorie changes. Nothing changes without your say-so.
                        </StepHead>
                        <Block>
                            <Switch label="Track a goal and review targets" checked={form.adaptive} onChange={(v: boolean) => set('adaptive', v)} />
                            {!form.adaptive && (
                                <p className="mt-1.5 text-[13px] text-neutral-500">
                                    Off: the plan is just dates and targets. You can skip this step.
                                </p>
                            )}
                            {form.adaptive && (
                                <div className="mt-5 flex flex-col gap-5">
                                    <Select
                                        label="Goal type"
                                        options={GOAL_MODES.map((m) => ({ value: m, label: GOAL_MODE_LABELS[m] }))}
                                        value={form.goalMode}
                                        onChange={(v) => set('goalMode', v as GoalMode)}
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input label="Start weight (kg)" type="number" step="0.1" min={0} value={form.startWeight} onChange={(e) => set('startWeight', e.target.value)} />
                                        <Input label="Start body fat (%)" type="number" step="0.1" min={0} value={form.startBodyFat} onChange={(e) => set('startBodyFat', e.target.value)} />
                                        <Input label="Target weight (kg)" type="number" step="0.1" min={0} value={form.targetWeight} onChange={(e) => set('targetWeight', e.target.value)} />
                                        <Input label="Target body fat (%)" type="number" step="0.1" min={0} value={form.targetBodyFat} onChange={(e) => set('targetBodyFat', e.target.value)} />
                                        <Input label="Acceptable from (kg)" type="number" step="0.1" min={0} value={form.targetWeightMin} onChange={(e) => set('targetWeightMin', e.target.value)} />
                                        <Input label="Acceptable to (kg)" type="number" step="0.1" min={0} value={form.targetWeightMax} onChange={(e) => set('targetWeightMax', e.target.value)} />
                                        <Input label="Rate band from (kg/wk)" type="number" step="0.05" placeholder="-0.7" value={form.rateMin} onChange={(e) => set('rateMin', e.target.value)} />
                                        <Input label="Rate band to (kg/wk)" type="number" step="0.05" placeholder="-0.3" value={form.rateMax} onChange={(e) => set('rateMax', e.target.value)} />
                                        <Input label="Protein floor (g)" type="number" min={0} hint="Held flat when calories move." value={form.proteinFloor} onChange={(e) => set('proteinFloor', e.target.value)} />
                                    </div>
                                    <p className="text-[13px] text-neutral-500">
                                        The rate band is how fast is fine without a change. Loss is negative, so “from” is
                                        the faster end.
                                    </p>
                                    {implication && <p className="bg-neutral-50 px-3 py-2 text-[13px] text-neutral-600">{implication}</p>}

                                    <div>
                                        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-[13px] font-medium text-neutral-700 underline">
                                            {showAdvanced ? 'Hide' : 'Show'} review settings
                                        </button>
                                        {showAdvanced && (
                                            <div className="mt-4 flex flex-col gap-4">
                                                <p className="text-[13px] text-neutral-500">Blank uses the default shown.</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <Input label="Review window (days)" type="number" min={1} placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.reviewWindowDays)} value={form.reviewWindowDays} onChange={(e) => set('reviewWindowDays', e.target.value)} />
                                                    <Input label="Max adjustment (kcal)" type="number" min={0} placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.maxAdjustmentKcal)} value={form.maxAdjustmentKcal} onChange={(e) => set('maxAdjustmentKcal', e.target.value)} />
                                                    <Input label="Minimum data (days)" type="number" min={1} placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.minimumDataDays)} value={form.minimumDataDays} onChange={(e) => set('minimumDataDays', e.target.value)} />
                                                    <Input label="Days before advising" type="number" min={1} placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.preferredDataDays)} value={form.preferredDataDays} onChange={(e) => set('preferredDataDays', e.target.value)} />
                                                    <Input label="Adherence tolerance (kcal)" type="number" min={0} placeholder={String(DEFAULT_ADAPTIVE_SETTINGS.calorieAdherenceToleranceKcal)} value={form.adherenceTolerance} onChange={(e) => set('adherenceTolerance', e.target.value)} />
                                                </div>
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
                                                            options={MACRO_ROLES.map((r) => ({ value: r, label: MACRO_ROLE_LABELS[r] }))}
                                                            value={form[key]}
                                                            onChange={(v) => set(key, v as MacroRole)}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="text-[13px] text-neutral-500">
                                                    When calories change: one macro should take the remainder.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </Block>
                    </section>
                )}

                {step === 'meals' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={4} title="A week of eating">
                            Seven days that repeat for the whole plan. Fill picks meals from your Library that land each
                            day on your targets; tap any meal to swap it. You can skip this and do it later.
                        </StepHead>
                        {meals ? (
                            <MealWeekBuilder menu={menu} onChange={setMenu} meals={meals} goals={goals} />
                        ) : (
                            <div className="grid place-items-center py-16">
                                <Spinner />
                            </div>
                        )}
                    </section>
                )}

                {step === 'review' && (
                    <section className="flex flex-col gap-8">
                        <StepHead n={5} title={isEdit ? 'Check and save' : 'Check and create'}>
                            Everything the plan holds. Tap a row to change it.
                        </StepHead>
                        {error && <Alert variant="danger">{error}</Alert>}
                        <ul className="border-t border-neutral-900">
                            <ReviewRow label="Plan" onEdit={() => setStep('about')}>
                                {form.name.trim() || 'No name'} · {NUTRITION_PHASE_LABELS[form.kind]}
                                <br />
                                {shortDate(form.startDate)} – {shortDate(form.endDate)} · {lengthLabel(form.startDate, form.endDate)}
                            </ReviewRow>
                            <ReviewRow label="Targets" onEdit={() => setStep('targets')}>
                                {goals
                                    ? [
                                          goals.calories && `${fmt(goals.calories)} kcal`,
                                          goals.protein && `${fmt(goals.protein)} g protein`,
                                          goals.carbs && `${fmt(goals.carbs)} g carbs`,
                                          goals.fat && `${fmt(goals.fat)} g fat`,
                                      ]
                                          .filter(Boolean)
                                          .join(' · ')
                                    : 'No targets'}
                                {form.weeklyRate.trim() && (
                                    <>
                                        <br />
                                        {form.weeklyRate} kg a week
                                    </>
                                )}
                                {form.cycling && (
                                    <>
                                        <br />
                                        Cycling: +{form.hardKcal || 100} hard days, −{form.restKcal || 150} rest days
                                    </>
                                )}
                            </ReviewRow>
                            <ReviewRow label="Goal" onEdit={() => setStep('goal')}>
                                {form.adaptive
                                    ? `${GOAL_MODE_LABELS[form.goalMode]}${form.targetWeight ? ` · to ${form.targetWeight} kg` : ''}${form.targetBodyFat ? ` · ${form.targetBodyFat}% body fat` : ''}`
                                    : 'None — dates and targets only'}
                            </ReviewRow>
                            <ReviewRow label="Meals" onEdit={() => setStep('meals')}>
                                {menu.length
                                    ? `${menu.length} meals across the week`
                                    : 'No meal week yet — add one in the Meals step, or later'}
                            </ReviewRow>
                        </ul>

                        {menu.length > 0 && (
                            <Block>
                                <Switch
                                    label={onPlanner ? 'Update the meals on the planner' : 'Put the meals on the planner'}
                                    checked={putOn}
                                    onChange={setPutOn}
                                />
                                {onPlanner > 0 && (
                                    <p className="mt-1.5 text-[13px] text-neutral-500">
                                        {onPlanner} of this plan’s meals are planned from today. Updating replaces them with
                                        the week as it is now; leave it off to keep them as they are.
                                    </p>
                                )}
                                {putOn && (
                                    <div className="mt-4 flex flex-col gap-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className={FIELD_LABEL}>From</span>
                                            <DatePicker
                                                value={applyFrom || null}
                                                minDate={form.startDate || undefined}
                                                maxDate={form.endDate || undefined}
                                                clearable={false}
                                                onChange={(v) => typeof v === 'string' && setFrom(v)}
                                            />
                                        </div>
                                        <p className="text-[13px] text-neutral-600">
                                            {applyPossible
                                                ? `Copies the week onto every day from ${shortDate(applyFrom)} to ${shortDate(form.endDate)}. Slots that already have something keep it.`
                                                : 'This plan has already ended, so there’s nothing to put on the planner.'}
                                        </p>
                                    </div>
                                )}
                            </Block>
                        )}
                    </section>
                )}
            </main>

            {/* Foot: Back / Next, and Create at the end. */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto flex min-h-[72px] max-w-5xl items-center gap-3 px-5 sm:px-8">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">
                        {blocked ? 'Give it a name and dates to carry on' : `Step ${at + 1} of ${STEPS.length}`}
                    </p>
                    {prev && (
                        <BarButton onClick={() => setStep(prev)} className="!border-neutral-300">
                            Back
                        </BarButton>
                    )}
                    {next ? (
                        <BarButton solid arrow disabled={blocked} onClick={() => setStep(next)}>
                            {step === 'goal' && !form.adaptive ? 'Skip' : step === 'meals' && menu.length === 0 ? 'Skip' : STEP_LABELS[next]}
                        </BarButton>
                    ) : (
                        <BarButton solid disabled={saving || !aboutOk} onClick={() => void create()}>
                            {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create plan'}
                        </BarButton>
                    )}
                </div>
            </div>

            <ConfirmModal
                open={confirmLeave}
                title={isEdit ? 'Discard your changes?' : 'Discard this plan?'}
                message={
                    isEdit
                        ? 'Close without saving? The plan stays as it was.'
                        : 'Nothing has been saved yet. Close the builder and lose what you’ve entered?'
                }
                confirmLabel="Discard"
                danger
                onConfirm={leave}
                onClose={() => setConfirmLeave(false)}
            />
        </div>
    )
}

/** A fresh form: starts today, runs 12 weeks, a cut. */
function newForm(): FormState {
    const f = blankForm()
    return { ...f, endDate: addDays(f.startDate, 12 * 7 - 1) }
}

function StepHead({ n, title, children }: { n: number; title: string; children: ReactNode }) {
    return (
        <header>
            <Eyebrow>
                Step {n} of {STEPS.length}
            </Eyebrow>
            <div className="mt-3">
                <SectionTitle>{title}</SectionTitle>
            </div>
            <p className="mt-3 max-w-[560px] text-[15px] leading-normal text-neutral-600">{children}</p>
        </header>
    )
}

function Block({ children }: { children: ReactNode }) {
    return <div className="border border-neutral-300 p-5">{children}</div>
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
    return (
        <li className="border-b border-hairline">
            <button type="button" onClick={onEdit} className="flex w-full items-start gap-4 py-4 text-left hover:bg-neutral-50">
                <span className={`${CAPS} w-20 shrink-0 pt-0.5 text-neutral-500`}>{label}</span>
                <span className="min-w-0 flex-1 text-[15px] leading-relaxed text-neutral-900">{children}</span>
                <i className="fa-solid fa-pen pt-1 text-[11px] text-neutral-400" aria-hidden="true" />
            </button>
        </li>
    )
}
