import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { updateSettings } from '../../services/users'
import { Card, CardHeader, CardTitle, CardBody } from '../Card'
import TimePicker from '../TimePicker'
import Switch from '../Switch'
import Button from '../Button'
import Alert from '../Alert'
import type { UserSettings } from '../../types'

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
    const [workDays, setWorkDays] = useState<number[]>(s.workDays ?? [1, 2, 3, 4, 5])
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)

    async function handleSave() {
        setMsg(null)
        setSaving(true)
        try {
            const payload: UserSettings = {
                wakeTime: wakeTime ?? '',
                bedTime: bedTime ?? '',
                workStart: workStart ?? '',
                workEnd: workEnd ?? '',
                showTotals,
                workDays,
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
                        <p className="mb-3 text-sm font-semibold text-neutral-700">Your day</p>
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
                    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                        <p className="mb-1 text-sm font-semibold text-neutral-700">Working hours</p>
                        <p className="mb-3 text-xs text-neutral-400">
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
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Working days</p>
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
                                                    : 'bg-white text-neutral-400 ring-1 ring-neutral-200 hover:ring-neutral-300'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Calendar */}
                    <div className="flex items-start justify-between gap-4 border-t border-neutral-100 pt-6">
                        <div>
                            <p className="text-sm font-semibold text-neutral-700">Totals</p>
                            <p className="mt-0.5 text-xs text-neutral-400">
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
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </span>
            {children}
        </div>
    )
}
