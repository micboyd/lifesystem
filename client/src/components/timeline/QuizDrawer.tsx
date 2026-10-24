import { useState, type ReactNode } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Checkbox from '../Checkbox'
import DatePicker from '../DatePicker'
import PillToggle from '../PillToggle'
import { FIELD_LABEL } from '../fieldStyles'
import type {
    ActivityLevel,
    CreatineUse,
    ProteinHabit,
    SleepBand,
    TimelineQuiz,
    TrainingAge,
} from '../../types'

/**
 * The Timeline quiz. Every question has an answer picked by default except the
 * two that matter most — how closely each plan will really be followed — so the
 * projection is never built on an adherence nobody chose.
 */

const TRAINING: { value: number; label: string; hint: string }[] = [
    { value: 1, label: 'Every session', hint: 'Nothing missed' },
    { value: 0.9, label: 'Miss the odd one', hint: 'One or two a month' },
    { value: 0.75, label: 'Most sessions', hint: 'Roughly one a week missed' },
    { value: 0.5, label: 'About half', hint: 'Life gets in the way' },
]

const NUTRITION: { value: number; label: string; hint: string }[] = [
    { value: 1, label: 'Every day', hint: 'Plan followed to the gram' },
    { value: 0.9, label: 'Almost every day', hint: 'A slip a week' },
    { value: 0.75, label: 'Weekdays on plan', hint: 'Weekends looser' },
    { value: 0.5, label: 'About half the time', hint: 'On and off' },
]

const AGES: { value: TrainingAge; label: string; hint: string }[] = [
    { value: 'beginner', label: 'Beginner', hint: 'Under a year of consistent lifting' },
    { value: 'intermediate', label: 'Intermediate', hint: '1–3 years' },
    { value: 'advanced', label: 'Advanced', hint: '3+ years, progress is slow' },
]

const CREATINE: { value: CreatineUse; label: string; hint: string }[] = [
    { value: 'no', label: 'No', hint: 'Not taking it' },
    { value: 'new', label: 'Starting it', hint: 'New, or under 4 weeks in' },
    { value: 'already', label: 'Already taking it', hint: '4+ weeks, fully loaded' },
]

const PROTEIN: { value: ProteinHabit; label: string; hint: string }[] = [
    { value: 'always', label: 'Always', hint: 'Hit it most days' },
    { value: 'mostly', label: 'Mostly', hint: 'Short a few days a week' },
    { value: 'rarely', label: 'Rarely', hint: 'Not really tracking it' },
]

const SLEEP: { value: SleepBand; label: string }[] = [
    { value: 'under6', label: 'Under 6 h' },
    { value: '6to7', label: '6–7 h' },
    { value: '7to8', label: '7–8 h' },
    { value: 'over8', label: '8 h +' },
]

const ACTIVITY: { value: ActivityLevel; label: string; hint: string }[] = [
    { value: 'low', label: 'Low', hint: 'Desk-bound, under 5k steps' },
    { value: 'some', label: 'Some', hint: '5–8k steps' },
    { value: 'active', label: 'Active', hint: '8–12k steps' },
    { value: 'very', label: 'Very active', hint: '12k+ or on your feet all day' },
]

const DOSES = [3, 5, 10]

/** Index of the last question. */
const LAST = 7

type Draft = Omit<TimelineQuiz, 'trainingAdherence' | 'nutritionAdherence' | 'answeredAt'> & {
    trainingAdherence: number | null
    nutritionAdherence: number | null
}

function draftFrom(quiz: TimelineQuiz | undefined, today: string): Draft {
    return {
        trainingAdherence: quiz?.trainingAdherence ?? null,
        nutritionAdherence: quiz?.nutritionAdherence ?? null,
        trainingAge: quiz?.trainingAge ?? 'intermediate',
        creatine: quiz?.creatine ?? 'no',
        creatineDoseG: quiz?.creatineDoseG ?? 5,
        creatineLoading: quiz?.creatineLoading ?? false,
        creatineStart: quiz?.creatineStart ?? today,
        protein: quiz?.protein ?? 'mostly',
        sleep: quiz?.sleep ?? '7to8',
        activity: quiz?.activity ?? 'some',
        bodyFatPct: quiz?.bodyFatPct,
    }
}

export default function QuizDrawer({
    open,
    quiz,
    today,
    hasRecentBodyFat,
    saving,
    onClose,
    onSave,
}: {
    open: boolean
    quiz: TimelineQuiz | undefined
    today: string
    /** A body-fat reading is logged recently, so the typed one won't be used. */
    hasRecentBodyFat: boolean
    saving: boolean
    onClose: () => void
    onSave: (quiz: TimelineQuiz) => void
}) {
    const [draft, setDraft] = useState<Draft>(() => draftFrom(quiz, today))
    const [bodyFatText, setBodyFatText] = useState(quiz?.bodyFatPct?.toString() ?? '')

    // One question per screen.
    const [step, setStep] = useState(0)

    // Start from the saved answers, on the first question, each time the drawer opens.
    const [wasOpen, setWasOpen] = useState(open)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            setDraft(draftFrom(quiz, today))
            setBodyFatText(quiz?.bodyFatPct?.toString() ?? '')
            setStep(0)
        }
    }

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
    const ready = draft.trainingAdherence !== null && draft.nutritionAdherence !== null
    const bf = Number(bodyFatText)
    const bfValid = bodyFatText.trim() === '' || (Number.isFinite(bf) && bf >= 3 && bf <= 60)

    function submit() {
        if (!ready || !bfValid) return
        const out: TimelineQuiz = {
            trainingAdherence: draft.trainingAdherence!,
            nutritionAdherence: draft.nutritionAdherence!,
            trainingAge: draft.trainingAge,
            creatine: draft.creatine,
            protein: draft.protein,
            sleep: draft.sleep,
            activity: draft.activity,
            answeredAt: new Date().toISOString(),
        }
        if (draft.creatine !== 'no') out.creatineDoseG = draft.creatineDoseG
        if (draft.creatine === 'new') {
            out.creatineLoading = draft.creatineLoading
            out.creatineStart = draft.creatineStart
        }
        if (bodyFatText.trim() !== '') out.bodyFatPct = bf
        onSave(out)
    }


    const pick =
        <K extends keyof Draft>(key: K, advance = true) =>
        (value: Draft[K]) => {
            set(key, value)
            // A beat to see the choice land, then on to the next question.
            if (advance) window.setTimeout(() => setStep((n) => Math.min(n + 1, LAST)), 220)
        }

    const steps: { title: string; hint?: string; answered: boolean; body: ReactNode }[] = [
        {
            title: 'How closely will you follow the training plan?',
            hint: 'Be honest — it’s more motivating when it comes true.',
            answered: draft.trainingAdherence !== null,
            body: <Choices options={TRAINING} value={draft.trainingAdherence} onChange={pick('trainingAdherence')} />,
        },
        {
            title: 'And the nutrition plan?',
            hint: 'Weekends count.',
            answered: draft.nutritionAdherence !== null,
            body: <Choices options={NUTRITION} value={draft.nutritionAdherence} onChange={pick('nutritionAdherence')} />,
        },
        {
            title: 'How long have you been lifting?',
            hint: 'Sets how fast muscle and strength can come.',
            answered: true,
            body: <Choices options={AGES} value={draft.trainingAge} onChange={pick('trainingAge')} />,
        },
        {
            title: 'Are you taking creatine?',
            answered: true,
            body: (
                <>
                    <Choices
                        options={CREATINE}
                        value={draft.creatine}
                        onChange={(v) => pick('creatine', v === 'no')(v)}
                    />
                    {draft.creatine !== 'no' && (
                        <div className="mt-4 flex flex-col gap-4 rounded-2xl bg-neutral-50 p-4">
                            <div className="flex flex-col gap-2">
                                <span className={FIELD_LABEL}>Daily dose</span>
                                <PillToggle
                                    label="Daily creatine dose"
                                    options={DOSES.map((g) => ({ value: g, label: `${g} g` }))}
                                    value={draft.creatineDoseG ?? 5}
                                    onChange={(g) => set('creatineDoseG', g)}
                                />
                            </div>
                            {draft.creatine === 'new' && (
                                <>
                                    <div className="flex flex-col gap-1.5">
                                        <span className={FIELD_LABEL}>Starting on</span>
                                        <DatePicker
                                            value={draft.creatineStart}
                                            onChange={(v) => typeof v === 'string' && set('creatineStart', v)}
                                        />
                                    </div>
                                    <Checkbox
                                        label="Loading week first (20 g a day for 5–7 days)"
                                        checked={!!draft.creatineLoading}
                                        onChange={(v) => set('creatineLoading', v)}
                                    />
                                </>
                            )}
                        </div>
                    )}
                </>
            ),
        },
        {
            title: 'Do you hit your protein?',
            answered: true,
            body: <Choices options={PROTEIN} value={draft.protein} onChange={pick('protein')} />,
        },
        {
            title: 'How much do you sleep?',
            hint: 'On a normal night.',
            answered: true,
            body: <Choices options={SLEEP} value={draft.sleep} onChange={pick('sleep')} />,
        },
        {
            title: 'How active are you outside training?',
            answered: true,
            body: <Choices options={ACTIVITY} value={draft.activity} onChange={pick('activity')} />,
        },
        {
            title: 'Know your body fat?',
            hint: hasRecentBodyFat
                ? 'You’ve logged a reading recently, so that’s used instead.'
                : 'Optional. Leave it blank and it’s estimated from height and weight.',
            answered: bfValid,
            body: (
                <div className="max-w-[12rem]">
                    <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="e.g. 20"
                        value={bodyFatText}
                        onChange={(e) => setBodyFatText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        error={bfValid ? undefined : '3–60%'}
                        aria-label="Body fat percentage"
                    />
                </div>
            ),
        },
    ]
    const current = steps[step]
    const last = step === LAST

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={quiz ? 'Retake the quiz' : 'Build your timeline'}
            size="xl"
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    {step > 0 ? (
                        <Button variant="ghost" icon="fa-solid fa-arrow-left" onClick={() => setStep(step - 1)}>
                            Back
                        </Button>
                    ) : (
                        <span />
                    )}
                    {last ? (
                        <Button onClick={submit} disabled={!ready || !bfValid || saving}>
                            {saving ? 'Saving…' : quiz ? 'Update timeline' : 'Build timeline'}
                        </Button>
                    ) : (
                        <Button
                            icon="fa-solid fa-arrow-right"
                            iconPosition="right"
                            onClick={() => setStep(step + 1)}
                            disabled={!current.answered}
                        >
                            Next
                        </Button>
                    )}
                </div>
            }
        >
            <div className="flex min-h-full flex-col">
                <div>
                    <div className="flex items-center justify-between text-[12px] font-medium text-neutral-500">
                        <span className="nums">
                            Question {step + 1} of {steps.length}
                        </span>
                        {quiz && !last && ready && (
                            <button
                                type="button"
                                onClick={() => setStep(LAST)}
                                className="text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
                            >
                                Skip to the end
                            </button>
                        )}
                    </div>
                    <div className="mt-2 flex gap-1" aria-hidden="true">
                        {steps.map((st, i) => (
                            <button
                                key={i}
                                type="button"
                                tabIndex={-1}
                                onClick={() => i < step && setStep(i)}
                                className={`h-1 flex-1 rounded-full transition-colors ${
                                    i <= step ? 'bg-coral-500' : 'bg-neutral-200'
                                } ${i < step ? 'cursor-pointer' : 'cursor-default'}`}
                                title={i < step ? st.title : undefined}
                            />
                        ))}
                    </div>
                </div>

                <section key={step} className="mt-8">
                    <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-neutral-950">
                        {current.title}
                    </h3>
                    {current.hint && <p className="mt-1.5 text-sm text-neutral-500">{current.hint}</p>}
                    <div className="mt-6">{current.body}</div>
                </section>
            </div>
        </Drawer>
    )
}

function Choices<T extends string | number>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string; hint?: string }[]
    value: T | null
    onChange: (value: T) => void
}) {
    return (
        <div role="radiogroup" className="flex flex-col gap-2">
            {options.map((o) => {
                const on = o.value === value
                return (
                    <button
                        key={String(o.value)}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(o.value)}
                        className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                            on
                                ? 'bg-neutral-900 text-white'
                                : 'bg-white text-neutral-900 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                        }`}
                    >
                        <span className="min-w-0">
                            <span className="block text-[15px] font-medium">{o.label}</span>
                            {o.hint && (
                                <span className={`block text-[13px] ${on ? 'text-neutral-300' : 'text-neutral-500'}`}>
                                    {o.hint}
                                </span>
                            )}
                        </span>
                        <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                                on ? 'bg-white text-neutral-900' : 'ring-[1.5px] ring-inset ring-neutral-300'
                            }`}
                            aria-hidden="true"
                        >
                            {on && <i className="fa-solid fa-check" />}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

