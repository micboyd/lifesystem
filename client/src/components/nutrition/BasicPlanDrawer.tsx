import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import DatePicker from '../DatePicker'
import { FIELD_LABEL } from '../fieldStyles'
import Textarea from '../Textarea'
import Alert from '../Alert'
import { blankForm, inputFrom, readNumber, type FormState } from './planForm'
import { createNutritionPhase } from '../../services/nutritionPhases'
import { useToast } from '../../context/ToastContext'
import { addDays } from '../../lib/calendar'
import { NUTRITION_PHASE_KINDS, NUTRITION_PHASE_LABELS, type NutritionPhase } from '../../types'

const LENGTHS = [4, 8, 12, 16]

/**
 * A basic plan: name, dates, direction and daily targets — nothing else. It
 * guides the planner and Stats (they judge each day against its targets) but
 * has no meal week and never puts meals on the planner. The full builder stays
 * for plans that fill the week.
 */
export default function BasicPlanDrawer({
    open,
    onClose,
    onCreated,
}: {
    open: boolean
    onClose: () => void
    onCreated: (plan: NutritionPhase) => void
}) {
    const toast = useToast()
    const [form, setForm] = useState<FormState>(blankForm)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

    const datesOk = form.startDate !== '' && form.endDate !== '' && form.startDate <= form.endDate
    const ok = form.name.trim() !== '' && datesOk && readNumber(form.calories) !== undefined

    function close() {
        if (saving) return
        setForm(blankForm())
        setError(null)
        onClose()
    }

    async function create() {
        if (!ok) return
        setSaving(true)
        setError(null)
        try {
            const plan = await createNutritionPhase(inputFrom({ ...form, name: form.name.trim() }))
            toast.show(`Created ${plan.name}`, 'success')
            onCreated(plan)
            setForm(blankForm())
            onClose()
        } catch (err) {
            const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
            setError(message ?? 'Couldn’t create the plan. Try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={close}
            title="Basic plan"
            footer={
                <>
                    <Button variant="ghost" onClick={close} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void create()} disabled={!ok || saving}>
                        {saving ? 'Creating…' : 'Create plan'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-6">
                <p className="text-[14px] leading-6 text-neutral-600">
                    Dates and daily targets to aim for. The planner and Stats measure each day against them — no meals
                    are put on the planner.
                </p>
                {error && <Alert variant="danger">{error}</Alert>}

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
                    <div className="mt-3 flex flex-wrap gap-2">
                        {LENGTHS.map((w) => {
                            const end = form.startDate ? addDays(form.startDate, w * 7 - 1) : ''
                            const on = end !== '' && form.endDate === end
                            return (
                                <button
                                    key={w}
                                    type="button"
                                    disabled={!form.startDate}
                                    onClick={() => set('endDate', end)}
                                    className={`h-9 rounded-lg border px-3 text-[13px] transition-colors ${
                                        on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                                    }`}
                                >
                                    {w} weeks
                                </button>
                            )
                        })}
                    </div>
                    {form.startDate && form.endDate && form.startDate > form.endDate && (
                        <p className="mt-2 text-[13px] text-red-700">The end is before the start.</p>
                    )}
                </div>

                <div>
                    <p className="mb-2 text-[13px] font-medium text-neutral-700">Direction</p>
                    <div role="radiogroup" aria-label="Direction" className="grid grid-cols-3 gap-2">
                        {NUTRITION_PHASE_KINDS.map((kind) => {
                            const on = form.kind === kind
                            return (
                                <button
                                    key={kind}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => set('kind', kind)}
                                    className={`h-11 rounded-lg border text-[14px] font-medium transition-colors ${
                                        on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-800 hover:border-neutral-900'
                                    }`}
                                >
                                    {NUTRITION_PHASE_LABELS[kind]}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div>
                    <p className="mb-2 text-[13px] font-medium text-neutral-700">Daily targets</p>
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Calories" type="number" min={0} placeholder="2200" value={form.calories} onChange={(e) => set('calories', e.target.value)} />
                        <Input label="Protein (g)" type="number" min={0} placeholder="180" value={form.protein} onChange={(e) => set('protein', e.target.value)} />
                        <Input label="Carbs (g)" type="number" min={0} placeholder="Optional" value={form.carbs} onChange={(e) => set('carbs', e.target.value)} />
                        <Input label="Fat (g)" type="number" min={0} placeholder="Optional" value={form.fat} onChange={(e) => set('fat', e.target.value)} />
                    </div>
                </div>

                <Textarea label="Notes" rows={3} placeholder="Anything to steer by — e.g. two batch cooks a week" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
        </Drawer>
    )
}
