import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { updateSettings } from '../../services/users'
import { Card, CardHeader, CardTitle, CardBody } from '../Card'
import TimePicker from '../TimePicker'
import Switch from '../Switch'
import DatePicker from '../DatePicker'
import Input from '../Input'
import Button from '../Button'
import Alert from '../Alert'
import Select from '../Select'
import { listWeightLogs } from '../../services/weightLogs'
import { bmrReadout, missingForBmr } from '../../lib/bmr'
import { todayKey } from '../../lib/calendar'
import type { BodyProfile, UserSettings, WeightLog } from '../../types'

function errorMessage(err: unknown, fallback: string): string {
    return (
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
    )
}

export default function SettingsCard() {
    const { user, updateUser } = useAuth()
    const s = user?.settings ?? {}

    const [wakeTime, setWakeTime] = useState<string | null>(s.wakeTime ?? null)
    const [bedTime, setBedTime] = useState<string | null>(s.bedTime ?? null)
    const [workStart, setWorkStart] = useState<string | null>(s.workStart ?? null)
    const [workEnd, setWorkEnd] = useState<string | null>(s.workEnd ?? null)
    const [showTotals, setShowTotals] = useState<boolean>(s.showTotals ?? false)
    const [financeStartDate, setFinanceStartDate] = useState<string>(s.financeStartDate ?? '')
    const [workDays, setWorkDays] = useState<number[]>(s.workDays ?? [1, 2, 3, 4, 5])
    const g = s.macroGoals ?? {}
    const [goalCalories, setGoalCalories] = useState<string>(g.calories ? String(g.calories) : '')
    const [goalProtein, setGoalProtein] = useState<string>(g.protein ? String(g.protein) : '')
    const [goalCarbs, setGoalCarbs] = useState<string>(g.carbs ? String(g.carbs) : '')
    const [goalFat, setGoalFat] = useState<string>(g.fat ? String(g.fat) : '')
    const bp = s.bodyProfile ?? {}
    const [heightCm, setHeightCm] = useState<string>(bp.heightCm ? String(bp.heightCm) : '')
    const [birthDate, setBirthDate] = useState<string>(bp.birthDate ?? '')
    const [sex, setSex] = useState<string>(bp.sex ?? '')
    // Weigh-ins, so the BMR the profile gives can be shown as it's filled in.
    const [weights, setWeights] = useState<WeightLog[]>([])
    useEffect(() => {
        listWeightLogs()
            .then(setWeights)
            .catch(() => {})
    }, [])
    const profile: BodyProfile = useMemo(
        () => ({
            heightCm: Number(heightCm) > 0 ? Number(heightCm) : undefined,
            birthDate: birthDate || undefined,
            sex: sex === 'male' || sex === 'female' ? sex : undefined,
        }),
        [heightCm, birthDate, sex]
    )
    const readout = bmrReadout(profile, weights, todayKey())
    const missing = missingForBmr(profile, weights)
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)

    async function handleSave() {
        setMsg(null)
        setSaving(true)
        try {
            const goal = (v: string): number | undefined => {
                const n = Number(v)
                return Number.isFinite(n) && n > 0 ? n : undefined
            }
            const payload: UserSettings = {
                wakeTime: wakeTime ?? '',
                bedTime: bedTime ?? '',
                workStart: workStart ?? '',
                workEnd: workEnd ?? '',
                showTotals,
                workDays,
                financeStartDate: financeStartDate || undefined,
                macroGoals: {
                    calories: goal(goalCalories),
                    protein: goal(goalProtein),
                    carbs: goal(goalCarbs),
                    fat: goal(goalFat),
                },
                // An empty profile clears it on the server.
                bodyProfile: profile,
            }
            const updated = await updateSettings(payload)
            updateUser(updated)
            setMsg({ type: 'success', text: 'Settings saved.' })
        } catch (err) {
            setMsg({ type: 'danger', text: errorMessage(err, 'Could not save settings.') })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>General settings</CardTitle>
            </CardHeader>
            <CardBody>
                <div className="flex flex-col gap-6">
                    {msg && <Alert variant={msg.type}>{msg.text}</Alert>}

                    {/* Wake up / Bed time */}
                    <div>
                        <p className="mb-3 text-sm font-medium text-neutral-700">Your day</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Wake up">
                                <TimePicker
                                    value={wakeTime}
                                    onChange={setWakeTime}
                                    placeholder="Set time"
                                />
                            </Field>
                            <Field label="Bed time">
                                <TimePicker
                                    value={bedTime}
                                    onChange={setBedTime}
                                    minTime={wakeTime ?? undefined}
                                    placeholder="Set time"
                                />
                            </Field>
                        </div>
                    </div>

                    {/* Working hours — within the day */}
                    <div className="rounded-2xl border border-neutral-100 bg-white p-4">
                        <p className="mb-1 text-sm font-medium text-neutral-700">Working hours</p>
                        <p className="mb-3 text-[11px] text-neutral-500">
                            Sits within your wake and bed times.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Start">
                                <TimePicker
                                    value={workStart}
                                    onChange={setWorkStart}
                                    minTime={wakeTime ?? undefined}
                                    maxTime={workEnd ?? bedTime ?? undefined}
                                    placeholder="Set time"
                                />
                            </Field>
                            <Field label="End">
                                <TimePicker
                                    value={workEnd}
                                    onChange={setWorkEnd}
                                    minTime={workStart ?? wakeTime ?? undefined}
                                    maxTime={bedTime ?? undefined}
                                    placeholder="Set time"
                                />
                            </Field>
                        </div>
                        <div className="mt-4">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Working days</p>
                            <div className="flex gap-1.5">
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => {
                                    const day = i === 6 ? 0 : i + 1
                                    const active = workDays.includes(day)
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() =>
                                                setWorkDays(
                                                    active
                                                        ? workDays.filter((d) => d !== day)
                                                        : [...workDays, day].sort()
                                                )
                                            }
                                            className={`flex h-8 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                                                active
                                                    ? 'bg-neutral-900 text-white'
                                                    : 'bg-white text-neutral-500 ring-1 ring-neutral-200 hover:ring-neutral-300'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Finance start date */}
                    <div className="border-t border-neutral-100 pt-6">
                        <p className="text-sm font-semibold text-neutral-700">Finance start date</p>
                        <p className="mt-0.5 mb-3 text-xs text-neutral-500">
                            Hide all financial data before this date. Useful for starting fresh from a specific point.
                        </p>
                        <DatePicker
                            mode="single"
                            value={financeStartDate || null}
                            onChange={(v) => setFinanceStartDate(typeof v === 'string' ? v : '')}
                            placeholder="No start date set"
                        />
                    </div>

                    {/* Nutrition — daily macro goals */}
                    <div className="border-t border-neutral-100 pt-6">
                        <p className="text-sm font-semibold text-neutral-700">Daily macro goals</p>
                        <p className="mt-0.5 mb-3 text-xs text-neutral-500">
                            Per-day targets, tracked against your weekly meal plan. Leave a field
                            blank for no goal.
                        </p>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <Field label="Calories">
                                <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="kcal"
                                    value={goalCalories}
                                    onChange={(e) => setGoalCalories(e.target.value)}
                                />
                            </Field>
                            <Field label="Protein (g)">
                                <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="g"
                                    value={goalProtein}
                                    onChange={(e) => setGoalProtein(e.target.value)}
                                />
                            </Field>
                            <Field label="Carbs (g)">
                                <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="g"
                                    value={goalCarbs}
                                    onChange={(e) => setGoalCarbs(e.target.value)}
                                />
                            </Field>
                            <Field label="Fat (g)">
                                <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="g"
                                    value={goalFat}
                                    onChange={(e) => setGoalFat(e.target.value)}
                                />
                            </Field>
                        </div>
                    </div>

                    {/* Nutrition — body, for BMR */}
                    <div className="border-t border-neutral-100 pt-6">
                        <p className="text-sm font-semibold text-neutral-700">Body</p>
                        <p className="mt-0.5 mb-3 text-xs text-neutral-500">
                            Your BMR (calories burned at rest) is worked out from these and your trend
                            weight, and added to the burned figure from your watch for each day’s balance.
                        </p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <Field label="Height">
                                <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    inputMode="decimal"
                                    placeholder="cm"
                                    value={heightCm}
                                    onChange={(e) => setHeightCm(e.target.value)}
                                />
                            </Field>
                            <Field label="Date of birth">
                                <DatePicker
                                    mode="single"
                                    value={birthDate || null}
                                    onChange={(v) => setBirthDate(typeof v === 'string' ? v : '')}
                                    placeholder="Not set"
                                />
                            </Field>
                            <Field label="Sex">
                                <Select
                                    value={sex}
                                    onChange={setSex}
                                    placeholder="Not set"
                                    options={[
                                        { value: 'male', label: 'Male' },
                                        { value: 'female', label: 'Female' },
                                    ]}
                                />
                            </Field>
                        </div>
                        <div className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-sm">
                            {readout ? (
                                <>
                                    <p className="text-neutral-900">
                                        <span className="font-semibold tabular-nums">
                                            {readout.bmr.toLocaleString()} kcal
                                        </span>{' '}
                                        a day at rest
                                    </p>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        Mifflin–St Jeor · {readout.weightKg.toFixed(1)} kg trend weight · age{' '}
                                        {readout.age}. It moves with your weight.
                                    </p>
                                    {readout.fromLeanMass && (
                                        <p className="mt-1.5 text-xs text-neutral-500">
                                            From lean mass it’d be{' '}
                                            <span className="font-medium tabular-nums text-neutral-700">
                                                {readout.fromLeanMass.bmr.toLocaleString()} kcal
                                            </span>{' '}
                                            (Katch–McArdle, {readout.fromLeanMass.bodyFatPct.toFixed(1)}% body fat) —
                                            a second opinion only.
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-neutral-600">
                                    Add your {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} to work out your BMR.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Calendar */}
                    <div className="flex items-start justify-between gap-4 border-t border-neutral-100 pt-6">
                        <div>
                            <p className="text-sm font-semibold text-neutral-700">Totals</p>
                            <p className="mt-0.5 text-xs text-neutral-500">
                                Show custom number-tracking rows on the year calendar.
                            </p>
                        </div>
                        <Switch checked={showTotals} onChange={setShowTotals} />
                    </div>

                    <div>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save settings'}
                        </Button>
                    </div>
                </div>
            </CardBody>
        </Card>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                {label}
            </span>
            {children}
        </div>
    )
}
