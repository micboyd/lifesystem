import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Select from '../Select'
import Checkbox from '../Checkbox'
import Alert from '../Alert'
import {
    CALENDAR_COLORS,
    CALENDAR_COLOR_CLASSES,
    EMPTY_SEASON_LINKS,
    LIFE_PILLAR_ICONS,
    LIFE_PILLAR_LABELS,
    type CalendarColor,
    type Course,
    type Goal,
    type LifePillar,
    type LifePlan,
    type MonthNote,
    type NutritionPhase,
    type SavingsTarget,
    type Season,
    type SeasonInput,
    type SeasonLinks,
    type TrainingPlan,
} from '../../types'
import { formatMonthKey } from '../../lib/calendar'
import { monthRange } from '../../lib/lifeTimeline'

/**
 * Writing a season: its months, what it's for, and what it pulls in.
 *
 * Months are chosen from the plan's own window rather than typed, so a season
 * can't be authored outside the plan it belongs to — the server rejects that
 * anyway, and a picker that can't express the mistake beats an error message.
 */

/** Which link list a record belongs to, keyed by the field on SeasonLinks. */
type LinkKey = keyof SeasonLinks

interface LinkGroup {
    key: LinkKey
    label: string
    pillar: LifePillar
    options: { id: string; label: string; hint?: string }[]
}

export interface SeasonFormRecords {
    trainingPlans: TrainingPlan[]
    nutritionPhases: NutritionPhase[]
    savingsTargets: SavingsTarget[]
    courses: Course[]
    monthNotes: MonthNote[]
    goals: Goal[]
}

/** A blank season, positioned after whatever the plan already covers. */
function blankSeason(plan: LifePlan): SeasonInput {
    const covered = plan.seasons.reduce<string | null>(
        (latest, s) => (!latest || s.endMonth > latest ? s.endMonth : latest),
        null
    )
    const months = monthRange(plan.start, plan.end)
    const firstFree = covered
        ? (months.find((m) => m > covered) ?? plan.end)
        : plan.start
    return {
        name: '',
        startMonth: firstFree,
        endMonth: firstFree,
        focus: '',
        color: 'blue',
        intent: [],
        links: { ...EMPTY_SEASON_LINKS },
    }
}

export default function SeasonForm({
    open,
    plan,
    season,
    records,
    saving,
    error,
    onSave,
    onClose,
}: {
    open: boolean
    plan: LifePlan
    /** The season being edited, or null to create a new one. */
    season: Season | null
    records: SeasonFormRecords
    saving: boolean
    error: string | null
    onSave: (input: SeasonInput) => void
    onClose: () => void
}) {
    const [form, setForm] = useState<SeasonInput>(() => blankSeason(plan))
    const [intentText, setIntentText] = useState<Partial<Record<LifePillar, string>>>({})

    // Reload the form whenever a different season is opened, so an edit never
    // starts from the previous one's values.
    useEffect(() => {
        if (!open) return
        if (season) {
            setForm({
                name: season.name,
                startMonth: season.startMonth,
                endMonth: season.endMonth,
                focus: season.focus ?? '',
                color: season.color,
                intent: season.intent,
                links: { ...EMPTY_SEASON_LINKS, ...season.links },
            })
            setIntentText(
                Object.fromEntries(season.intent.map((i) => [i.pillar, i.text])) as Partial<
                    Record<LifePillar, string>
                >
            )
        } else {
            setForm(blankSeason(plan))
            setIntentText({})
        }
    }, [open, season, plan])

    const months = monthRange(plan.start, plan.end)
    const monthOptions = months.map((m) => ({ value: m, label: formatMonthKey(m) }))

    const groups: LinkGroup[] = [
        {
            key: 'trainingPlans',
            label: 'Training plans',
            pillar: 'training',
            options: records.trainingPlans.map((p) => ({
                id: p._id,
                label: p.name,
                hint: `${p.planStart.slice(0, 7)} → ${p.planEnd.slice(0, 7)}`,
            })),
        },
        {
            key: 'nutritionPhases',
            label: 'Nutrition phases',
            pillar: 'nutrition',
            options: records.nutritionPhases.map((p) => ({
                id: p._id,
                label: p.name,
                hint: `${p.startDate.slice(0, 7)} → ${p.endDate.slice(0, 7)}`,
            })),
        },
        {
            key: 'savingsTargets',
            label: 'Savings targets',
            pillar: 'money',
            options: records.savingsTargets.map((t) => ({
                id: t._id,
                label: t.name,
                hint: `${t.startMonth} → ${t.targetMonth}`,
            })),
        },
        {
            key: 'courses',
            label: 'Study',
            pillar: 'study',
            options: records.courses.map((c) => ({
                id: c._id,
                label: c.name,
                hint: c.targetDate ? `due ${c.targetDate}` : 'no deadline',
            })),
        },
        {
            key: 'monthNotes',
            label: 'Month flags',
            pillar: 'life',
            options: records.monthNotes.map((n) => ({
                id: n._id,
                label: n.label,
                hint: n.startMonth === n.endMonth ? n.startMonth : `${n.startMonth} → ${n.endMonth}`,
            })),
        },
        {
            key: 'goals',
            label: 'Goals',
            pillar: 'life',
            options: records.goals.map((g) => ({
                id: g._id,
                label: g.title,
                hint: g.targetDate ? `by ${g.targetDate}` : undefined,
            })),
        },
    ]

    function toggleLink(key: LinkKey, id: string) {
        setForm((f) => {
            const current = f.links[key]
            const next = current.includes(id)
                ? current.filter((x) => x !== id)
                : [...current, id]
            return { ...f, links: { ...f.links, [key]: next } }
        })
    }

    function submit() {
        // Intent is edited as one box per pillar; empty boxes are dropped rather
        // than saved as blank rows.
        const intent = plan.pillars
            .map((pillar) => ({ pillar, text: (intentText[pillar] ?? '').trim() }))
            .filter((i) => i.text.length > 0)
        onSave({
            ...form,
            name: form.name.trim(),
            focus: form.focus?.trim() ? form.focus.trim() : undefined,
            intent,
        })
    }

    const rangeInvalid = form.startMonth > form.endMonth

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={season ? 'Edit season' : 'New season'}
            size="xl"
            footer={
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onClose} fullWidth>
                        Cancel
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={saving || !form.name.trim() || rangeInvalid}
                        fullWidth
                    >
                        {saving ? 'Saving…' : season ? 'Save season' : 'Create season'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-6">
                {error && <Alert variant="danger">{error}</Alert>}

                <Input
                    label="Name"
                    placeholder="Cut & 10K"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />

                <div className="grid grid-cols-2 gap-3">
                    <Select
                        label="From"
                        options={monthOptions}
                        value={form.startMonth}
                        onChange={(v) => setForm((f) => ({ ...f, startMonth: v }))}
                    />
                    <Select
                        label="To"
                        options={monthOptions}
                        value={form.endMonth}
                        onChange={(v) => setForm((f) => ({ ...f, endMonth: v }))}
                        error={rangeInvalid ? 'Must be on or after the start' : undefined}
                    />
                </div>

                <Input
                    label="Focus"
                    placeholder="The season in a sentence"
                    value={form.focus ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, focus: e.target.value }))}
                />

                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Colour
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {CALENDAR_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, color: color as CalendarColor }))}
                                aria-label={color}
                                aria-pressed={form.color === color}
                                className={[
                                    'h-8 w-8 rounded-full transition-transform',
                                    CALENDAR_COLOR_CLASSES[color].dot,
                                    form.color === color
                                        ? 'ring-2 ring-neutral-900 ring-offset-2'
                                        : 'hover:scale-110',
                                ].join(' ')}
                            />
                        ))}
                    </div>
                </div>

                {/* Intent: one line per pillar the plan tracks. This is the part of a
                    season nothing else in the app records. */}
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Intent
                    </p>
                    {plan.pillars.map((pillar) => (
                        <div key={pillar} className="flex items-center gap-3">
                            <i
                                className={`fa-solid ${LIFE_PILLAR_ICONS[pillar]} w-4 shrink-0 text-center text-xs text-neutral-300`}
                                aria-hidden="true"
                            />
                            <input
                                value={intentText[pillar] ?? ''}
                                onChange={(e) =>
                                    setIntentText((t) => ({ ...t, [pillar]: e.target.value }))
                                }
                                placeholder={LIFE_PILLAR_LABELS[pillar]}
                                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm transition-colors placeholder:text-neutral-300 focus:border-neutral-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200"
                            />
                        </div>
                    ))}
                </div>

                {/* Links: what this season pulls in from the rest of the app. */}
                <div className="space-y-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            What&apos;s in it
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                            These stay owned by their own modules — linking them only tells the
                            season they belong to it.
                        </p>
                    </div>
                    {groups.map((group) =>
                        group.options.length === 0 ? null : (
                            <div key={group.key}>
                                <p className="text-xs font-bold text-neutral-700">{group.label}</p>
                                <div className="mt-1.5 space-y-1.5">
                                    {group.options.map((option) => (
                                        <div key={option.id} className="flex items-baseline gap-2">
                                            <Checkbox
                                                checked={form.links[group.key].includes(option.id)}
                                                onChange={() => toggleLink(group.key, option.id)}
                                                label={option.label}
                                            />
                                            {option.hint && (
                                                <span className="text-[11px] text-neutral-400">
                                                    {option.hint}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>
        </Drawer>
    )
}
