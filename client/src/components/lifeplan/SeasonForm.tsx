import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Select from '../Select'
import Alert from '../Alert'
import {
    CALENDAR_COLORS,
    CALENDAR_COLOR_CLASSES,
    EMPTY_SEASON_LINKS,
    LIFE_PILLAR_LABELS,
    type CalendarColor,
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
import { FIELD_BASE, FIELD_IDLE, FIELD_LABEL } from '../fieldStyles'
import { ChipToggle } from '../goals/ui'
import { PillarTile } from './ui'

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
    preset,
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
    /** Months a new season starts on — set when it's begun from a gap. */
    preset?: { startMonth: string; endMonth: string } | null
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
            setForm({ ...blankSeason(plan), ...(preset ?? {}) })
            setIntentText({})
        }
    }, [open, season, plan, preset])

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
                    <p className={FIELD_LABEL}>Colour</p>
                    <div className="mt-2 flex flex-wrap gap-2.5">
                        {CALENDAR_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, color: color as CalendarColor }))}
                                aria-label={color}
                                aria-pressed={form.color === color}
                                className={[
                                    'grid h-8 w-8 place-items-center rounded-full transition-transform',
                                    CALENDAR_COLOR_CLASSES[color].dot,
                                    form.color === color
                                        ? 'ring-2 ring-neutral-900 ring-offset-2'
                                        : 'hover:scale-110',
                                ].join(' ')}
                            >
                                {form.color === color && (
                                    <i className="fa-solid fa-check text-[11px] text-white" aria-hidden="true" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Intent: one line per pillar the plan tracks. This is the part of a
                    season nothing else in the app records. */}
                <div className="border-t border-neutral-100 pt-6">
                    <p className="text-base font-semibold tracking-[-0.01em] text-neutral-900">Intent</p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                        What this stretch is for, pillar by pillar. Leave a line empty to skip it.
                    </p>
                    <div className="mt-4 space-y-3">
                        {plan.pillars.map((pillar) => (
                            <label key={pillar} className="flex items-center gap-3">
                                <PillarTile pillar={pillar} size="md" />
                                <input
                                    value={intentText[pillar] ?? ''}
                                    onChange={(e) =>
                                        setIntentText((t) => ({ ...t, [pillar]: e.target.value }))
                                    }
                                    placeholder={LIFE_PILLAR_LABELS[pillar]}
                                    aria-label={`${LIFE_PILLAR_LABELS[pillar]} intent`}
                                    className={`${FIELD_BASE} ${FIELD_IDLE} h-11 px-3.5`}
                                />
                            </label>
                        ))}
                    </div>
                </div>

                {/* Links: what this season pulls in from the rest of the app. */}
                <div className="border-t border-neutral-100 pt-6">
                    <p className="text-base font-semibold tracking-[-0.01em] text-neutral-900">What&apos;s in it</p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                        These stay owned by their own modules — linking them only tells the season
                        they belong to it.
                    </p>
                    <div className="mt-4 space-y-5">
                        {groups.map((group) =>
                            group.options.length === 0 ? null : (
                                <div key={group.key}>
                                    <div className="flex items-center gap-2">
                                        <PillarTile pillar={group.pillar} size="xs" />
                                        <p className={FIELD_LABEL}>{group.label}</p>
                                        <span className="text-xs tabular-nums text-neutral-400">
                                            {form.links[group.key].length > 0 &&
                                                `${form.links[group.key].length} linked`}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {group.options.map((option) => (
                                            <span key={option.id} title={option.hint}>
                                                <ChipToggle
                                                    on={form.links[group.key].includes(option.id)}
                                                    onClick={() => toggleLink(group.key, option.id)}
                                                    icon={
                                                        form.links[group.key].includes(option.id)
                                                            ? 'fa-solid fa-check'
                                                            : 'fa-solid fa-plus'
                                                    }
                                                >
                                                    {option.label}
                                                </ChipToggle>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </Drawer>
    )
}
