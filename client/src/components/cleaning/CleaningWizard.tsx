import { useMemo, useState } from 'react'
import TimePicker from '../TimePicker'
import Input from '../Input'
import type { CleaningHome, CleaningRoom } from '../../types'
import Button from '../Button'
import Alert from '../Alert'
import { FIELD_LABEL, FIELD_HINT } from '../fieldStyles'
import RoomJobsEditor from './RoomJobsEditor'
import WeekGrid from './WeekGrid'
import {
    CUSTOM_ICON,
    DAY_SHORT,
    ROOM_PRESETS,
    WEEK_ORDER,
    buildSchedule,
    dailyMinutes,
    mondayOf,
    newKey,
    nextRoomName,
    roomFromPreset,
    roomIcon,
    roomWeeklyMinutes,
} from '../../lib/cleaning'
import { formatDuration } from '../../lib/time'
import { todayKey } from '../../lib/calendar'

export type WizardStep = 'rooms' | 'jobs' | 'time' | 'review'
const STEPS: { key: WizardStep; label: string }[] = [
    { key: 'rooms', label: 'Rooms' },
    { key: 'jobs', label: 'Jobs' },
    { key: 'time', label: 'Time' },
    { key: 'review', label: 'Schedule' },
]

const QUICK_MINUTES = [15, 20, 30, 45, 60]

/**
 * Map the home in four steps: which rooms there are, what needs cleaning in
 * each (one room at a time), how much time a day goes on it, then a look at
 * the week it makes before saving.
 */
export default function CleaningWizard({
    initial,
    startStep = 'rooms',
    onCancel,
    onSave,
}: {
    initial: CleaningHome | null
    startStep?: WizardStep
    onCancel?: () => void
    onSave: (home: CleaningHome) => Promise<void>
}) {
    const [step, setStep] = useState<WizardStep>(startStep)
    const [rooms, setRooms] = useState<CleaningRoom[]>(initial?.rooms ?? [])
    const [roomIndex, setRoomIndex] = useState(0)
    const [minutesPerDay, setMinutesPerDay] = useState(initial?.minutesPerDay ?? 30)
    const [days, setDays] = useState<number[]>(initial?.days ?? [1, 2, 3, 4, 5, 6, 0])
    const [startTime, setStartTime] = useState(initial?.startTime ?? '18:00')
    const [saving, setSaving] = useState(false)

    const stepIndex = STEPS.findIndex((s) => s.key === step)
    const named = rooms.filter((r) => r.name.trim())
    const totalJobs = rooms.reduce((n, r) => n + r.tasks.length, 0)
    const weekNeed = rooms.reduce((sum, r) => sum + roomWeeklyMinutes(r, days.length), 0)
    const weekGive = minutesPerDay * days.length
    const schedule = useMemo(
        () => (step === 'review' ? buildSchedule(named, { minutesPerDay, days }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [step, rooms, minutesPerDay, days]
    )

    const firstWeekOver = schedule?.weeks[0]?.filter((d) => d.total > d.capacity).length ?? 0
    const dailyNeed = dailyMinutes(named)

    const canNext =
        step === 'rooms' ? named.length > 0 : step === 'jobs' ? totalJobs > 0 : step === 'time' ? days.length > 0 && minutesPerDay >= 5 : true

    function next() {
        if (step === 'jobs' && roomIndex < rooms.length - 1) {
            setRoomIndex(roomIndex + 1)
            return
        }
        if (step === 'rooms') setRoomIndex(0)
        setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].key)
        window.scrollTo({ top: 0 })
    }

    function back() {
        if (step === 'jobs' && roomIndex > 0) {
            setRoomIndex(roomIndex - 1)
            return
        }
        if (step === 'time') setRoomIndex(Math.max(0, rooms.length - 1))
        if (stepIndex === 0) onCancel?.()
        else setStep(STEPS[stepIndex - 1].key)
        window.scrollTo({ top: 0 })
    }

    async function finish() {
        setSaving(true)
        try {
            await onSave({
                rooms: named.map((r) => ({ ...r, name: r.name.trim(), tasks: r.tasks.filter((t) => t.name.trim()) })),
                minutesPerDay,
                days,
                startTime,
                cycleStart: initial?.cycleStart ?? mondayOf(todayKey()),
            })
        } finally {
            setSaving(false)
        }
    }

    const room = rooms[roomIndex]

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
            <Stepper current={stepIndex} onJump={(i) => i < stepIndex && setStep(STEPS[i].key)} />

            {step === 'rooms' && (
                <RoomsStep rooms={rooms} onChange={setRooms} />
            )}

            {step === 'jobs' && room && (
                <section className="flex flex-col gap-6">
                    <StepTitle
                        title={`What needs cleaning in the ${room.name.trim() || 'room'}?`}
                        sub={`Room ${roomIndex + 1} of ${rooms.length}. Set how long each job takes and how often it needs doing.`}
                    />
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {rooms.map((r, i) => (
                            <button
                                key={r.key}
                                type="button"
                                onClick={() => setRoomIndex(i)}
                                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] transition-colors ${
                                    i === roomIndex
                                        ? 'bg-neutral-900 text-white'
                                        : 'border border-hairline bg-white text-neutral-700 hover:border-neutral-300'
                                }`}
                            >
                                <i className={`fa-solid ${roomIcon(r.kind)} text-[11px]`} aria-hidden="true" />
                                {r.name || 'Room'}
                                <span className={i === roomIndex ? 'text-white/60' : 'text-neutral-400'}>{r.tasks.length}</span>
                            </button>
                        ))}
                    </div>
                    <RoomJobsEditor
                        room={room}
                        onChange={(next) => setRooms(rooms.map((r) => (r.key === next.key ? next : r)))}
                    />
                </section>
            )}

            {step === 'time' && (
                <section className="flex flex-col gap-7">
                    <StepTitle title="How much time can you give it?" sub="Jobs that don’t fit in a day get split into parts across the week." />

                    <div className="flex flex-col gap-2">
                        <span className={FIELD_LABEL}>Minutes a day</span>
                        <div className="flex flex-wrap items-center gap-2">
                            {QUICK_MINUTES.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMinutesPerDay(m)}
                                    className={`h-11 min-w-[64px] rounded-lg px-3 text-sm font-medium nums transition-colors lg:h-10 ${
                                        minutesPerDay === m
                                            ? 'bg-neutral-900 text-white'
                                            : 'border border-hairline bg-white text-neutral-800 hover:border-neutral-300'
                                    }`}
                                >
                                    {formatDuration(m)}
                                </button>
                            ))}
                            <label className="relative w-28">
                                <span className="sr-only">Custom minutes</span>
                                <Input
                                    type="number"
                                    min={5}
                                    max={600}
                                    value={minutesPerDay}
                                    onChange={(e) => setMinutesPerDay(Math.max(0, Math.min(600, Math.round(Number(e.target.value)) || 0)))}
                                    className="nums"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[13px] text-neutral-500">
                                    min
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className={FIELD_LABEL}>Days you clean</span>
                        <div className="grid grid-cols-7 gap-1.5 sm:flex sm:gap-2">
                            {WEEK_ORDER.map((d) => {
                                const on = days.includes(d)
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                                        className={`h-11 rounded-lg text-[13px] font-medium transition-colors sm:w-14 lg:h-10 ${
                                            on
                                                ? 'bg-area-cleaning text-white'
                                                : 'border border-hairline bg-white text-neutral-600 hover:border-neutral-300'
                                        }`}
                                    >
                                        {DAY_SHORT[d]}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex w-40 flex-col gap-1.5">
                        <span className={FIELD_LABEL}>Usual start time</span>
                        <TimePicker value={startTime} onChange={(v) => v && setStartTime(v)} />
                        <span className={FIELD_HINT}>Used when adding to Timebox</span>
                    </div>

                    <Balance need={weekNeed} give={weekGive} />
                    {dailyNeed > minutesPerDay && (
                        <Alert variant="warning">
                            Your daily jobs alone take {formatDuration(dailyNeed)} — more than {formatDuration(minutesPerDay)}. Daily jobs can’t be
                            split or moved, so every day will run over. Give more time, or untick some daily jobs (go back to Jobs).
                        </Alert>
                    )}
                </section>
            )}

            {step === 'review' && schedule && (
                <section className="flex flex-col gap-6">
                    <StepTitle
                        title="Your cleaning week"
                        sub={
                            schedule.weeks.length > 1
                                ? 'Here’s your first week. Monthly and rarer jobs are spread over the weeks after — step through them once saved.'
                                : 'This week repeats. You can change anything later.'
                        }
                    />
                    {(schedule.splitJobs > 0 || firstWeekOver > 0) && (
                        <p className="text-[13px] text-neutral-600">
                            {schedule.splitJobs > 0 && (
                                <>
                                    {schedule.splitJobs} {schedule.splitJobs === 1 ? 'job is' : 'jobs are'} split into parts.{' '}
                                </>
                            )}
                            {firstWeekOver > 0 && (
                                <span className="text-amber-700">
                                    {firstWeekOver} {firstWeekOver === 1 ? 'day runs' : 'days run'} over — there’s more to do than time given.
                                </span>
                            )}
                        </p>
                    )}
                    <WeekGrid week={schedule.weeks[0] ?? []} />
                </section>
            )}

            <footer className="sticky bottom-0 z-10 -mx-2 flex items-center justify-between gap-3 bg-canvas/90 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                <div>
                    {(stepIndex > 0 || onCancel) && (
                        <Button variant="ghost" icon={stepIndex === 0 ? undefined : 'fa-solid fa-arrow-left'} onClick={back}>
                            {stepIndex === 0 ? 'Cancel' : 'Back'}
                        </Button>
                    )}
                </div>
                {step === 'review' ? (
                    <Button onClick={finish} disabled={saving} icon="fa-solid fa-check">
                        {saving ? 'Saving…' : 'Save schedule'}
                    </Button>
                ) : (
                    <Button onClick={next} disabled={!canNext} icon="fa-solid fa-arrow-right" iconPosition="right">
                        {step === 'jobs' && roomIndex < rooms.length - 1 ? `Next: ${rooms[roomIndex + 1].name || 'room'}` : 'Next'}
                    </Button>
                )}
            </footer>
        </div>
    )
}

function Stepper({ current, onJump }: { current: number; onJump: (i: number) => void }) {
    return (
        <ol className="grid grid-cols-4 gap-2">
            {STEPS.map((s, i) => (
                <li key={s.key}>
                    <button
                        type="button"
                        onClick={() => onJump(i)}
                        disabled={i >= current}
                        className="flex w-full flex-col gap-2 text-left disabled:cursor-default"
                    >
                        <span className={`h-1 rounded-full ${i <= current ? 'bg-area-cleaning' : 'bg-neutral-200'}`} />
                        <span className={`text-[12px] ${i === current ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}>
                            <span className="nums">{i + 1}</span> · {s.label}
                        </span>
                    </button>
                </li>
            ))}
        </ol>
    )
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
    return (
        <div>
            <h2 className="text-[26px] font-medium leading-tight tracking-[-0.035em] text-neutral-950 sm:text-[30px]">{title}</h2>
            <p className="mt-1.5 text-[15px] text-neutral-600">{sub}</p>
        </div>
    )
}

function RoomsStep({ rooms, onChange }: { rooms: CleaningRoom[]; onChange: (rooms: CleaningRoom[]) => void }) {
    const [custom, setCustom] = useState('')
    const count = (kind: string) => rooms.filter((r) => r.kind === kind).length

    function add(kind: string) {
        const preset = ROOM_PRESETS.find((p) => p.kind === kind)!
        onChange([...rooms, roomFromPreset(preset, nextRoomName(rooms, preset.label))])
    }
    function removeOne(kind: string) {
        const i = rooms.map((r) => r.kind).lastIndexOf(kind)
        if (i >= 0) onChange(rooms.filter((_, j) => j !== i))
    }
    function addCustom() {
        const name = custom.trim()
        if (!name) return
        onChange([...rooms, { key: newKey('r'), name: nextRoomName(rooms, name), kind: 'custom', tasks: [] }])
        setCustom('')
    }
    const customs = rooms.filter((r) => r.kind === 'custom')

    return (
        <section className="flex flex-col gap-6">
            <StepTitle title="What rooms are in your home?" sub="Tap a room to add it, or add it again for a second one. Common jobs come ticked — you’ll check them next." />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {ROOM_PRESETS.map((p) => {
                    const n = count(p.kind)
                    return (
                        <div
                            key={p.kind}
                            className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-3 transition-colors sm:flex-nowrap ${
                                n ? 'bg-area-cleaning-bg ring-1 ring-area-cleaning/30' : 'bg-white ring-1 ring-neutral-900/[0.06]'
                            }`}
                        >
                            {/* Phones: a picked room's −/+ drop to their own line so the name keeps its room. */}
                            <button type="button" onClick={() => add(p.kind)} className={`flex min-w-0 flex-1 items-center gap-3 text-left ${n ? 'basis-full sm:basis-auto' : ''}`}>
                                <span
                                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                                        n ? 'bg-area-cleaning text-white' : 'bg-neutral-100 text-neutral-600'
                                    }`}
                                >
                                    <i className={`fa-solid ${p.icon}`} aria-hidden="true" />
                                </span>
                                <span className="min-w-0 text-[14px] font-medium leading-tight text-neutral-900 sm:truncate">{p.label}</span>
                            </button>
                            {n > 0 && (
                                <div className="ml-auto flex shrink-0 items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => removeOne(p.kind)}
                                        aria-label={`One fewer ${p.label}`}
                                        className="grid h-8 w-8 place-items-center rounded-lg text-area-cleaning hover:bg-white"
                                    >
                                        <i className="fa-solid fa-minus text-[11px]" aria-hidden="true" />
                                    </button>
                                    <span className="w-4 text-center text-[14px] font-medium nums text-area-cleaning">{n}</span>
                                    <button
                                        type="button"
                                        onClick={() => add(p.kind)}
                                        aria-label={`Another ${p.label}`}
                                        className="grid h-8 w-8 place-items-center rounded-lg text-area-cleaning hover:bg-white"
                                    >
                                        <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-col gap-2">
                <span className={FIELD_LABEL}>Something else?</span>
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        addCustom()
                    }}
                >
                    <Input
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder="e.g. Conservatory, Garage, Car"
                        maxLength={80}
                        wrapperClassName="min-w-0 flex-1"
                    />
                    <Button variant="secondary" type="submit" disabled={!custom.trim()} className="lg:h-11">
                        Add room
                    </Button>
                </form>
                {customs.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {customs.map((r) => (
                            <span
                                key={r.key}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-area-cleaning-bg pl-3 pr-1 text-[13px] text-area-cleaning"
                            >
                                <i className={`fa-solid ${CUSTOM_ICON} text-[11px]`} aria-hidden="true" />
                                {r.name}
                                <button
                                    type="button"
                                    onClick={() => onChange(rooms.filter((x) => x.key !== r.key))}
                                    aria-label={`Remove ${r.name}`}
                                    className="grid h-7 w-7 place-items-center rounded-full hover:bg-white"
                                >
                                    <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {rooms.length > 0 && (
                <p className="text-[13px] text-neutral-600">
                    <span className="nums">{rooms.length}</span> {rooms.length === 1 ? 'room' : 'rooms'}:{' '}
                    {rooms.map((r) => r.name).join(', ')}
                </p>
            )}
        </section>
    )
}

/** Time needed a week vs time given, in plain words. */
function Balance({ need, give }: { need: number; give: number }) {
    const short = need - give
    return (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-hairline py-5">
            <div>
                <p className="text-[12px] text-neutral-600">Your home needs</p>
                <p className="mt-1 text-[26px] leading-tight tracking-[-0.045em] nums text-neutral-950">
                    {formatDuration(Math.round(need))}
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-500">a week, on average</p>
            </div>
            <div>
                <p className="text-[12px] text-neutral-600">You’re giving</p>
                <p className="mt-1 text-[26px] leading-tight tracking-[-0.045em] nums text-neutral-950">{formatDuration(give)}</p>
                <p className={`mt-0.5 text-[12px] ${short > 0 ? 'font-medium text-amber-700' : 'text-neutral-500'}`}>
                    {short > 0 ? `${formatDuration(Math.round(short))} short — some days will run over` : 'a week — enough'}
                </p>
            </div>
        </div>
    )
}
