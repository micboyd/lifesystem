import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import EmptyState from './EmptyState'
import DropdownMenu from './DropdownMenu'
import Drawer from './Drawer'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import Tabs from './Tabs'
import Alert from './Alert'
import Checkbox from './Checkbox'
import LineIcon from './LineIcon'
import PlanImportPanel from './PlanImportPanel'
import { useToast } from '../context/ToastContext'
import {
    listPlans,
    getPlan,
    deletePlan,
    applyPlan,
    unapplyPlan,
    type ApplyPlanOptions,
} from '../services/plans'
import { formatDateLong, formatWeekRange, todayKey } from '../lib/calendar'
import { FITNESS_PLAN_KINDS } from '../types'
import type { FitnessPlanKind, PlanRole, PlanScheduleEntry, TrainingPlan } from '../types'

// ─── Presentation ───────────────────────────────────────────────────────────────

const KIND_META: Record<FitnessPlanKind, { label: string; icon: string; chip: string }> = {
    workout: {
        label: 'Strength',
        icon: 'fa-solid fa-dumbbell',
        chip: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    },
    conditioning: {
        label: 'Conditioning',
        icon: 'fa-solid fa-heart-pulse',
        chip: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    },
    mobility: {
        label: 'Mobility',
        icon: 'fa-solid fa-person-walking',
        chip: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    },
    recovery: {
        label: 'Recovery',
        icon: 'fa-solid fa-bed',
        chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    },
}

const ROLE_LABEL: Record<PlanRole, string> = {
    strength: 'Strength workouts',
    run: 'Run progression',
    conditioning: 'Conditioning sessions',
    mobility: 'Mobility routines',
    recovery: 'Recovery items',
}

function KindChip({ kind, count }: { kind: FitnessPlanKind; count: number }) {
    const meta = KIND_META[kind]
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.chip}`}
        >
            <i className={meta.icon} aria-hidden="true" />
            {count} {meta.label}
        </span>
    )
}

/** Count a plan's linked items per library, in a stable order. */
function countByKind(plan: TrainingPlan): { kind: FitnessPlanKind; count: number }[] {
    return FITNESS_PLAN_KINDS.map((kind) => ({
        kind,
        count: plan.items.filter((i) => i.kind === kind).length,
    })).filter((c) => c.count > 0)
}

/** Turn a free-form goal / progression block into readable label + value rows. */
function proseRows(block: Record<string, unknown> | undefined): { label: string; value: string }[] {
    if (!block) return []
    const rows: { label: string; value: string }[] = []
    for (const [key, value] of Object.entries(block)) {
        if (typeof value !== 'string' || !value.trim()) continue
        // "primaryGoal" → "Primary goal"
        const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (c) => c.toUpperCase())
            .toLowerCase()
        rows.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value })
    }
    return rows
}

// ─── Library ────────────────────────────────────────────────────────────────────

export default function PlanLibrary() {
    const toast = useToast()
    const [loading, setLoading] = useState(true)
    const [plans, setPlans] = useState<TrainingPlan[]>([])
    const [importing, setImporting] = useState(false)
    const [openId, setOpenId] = useState<string | null>(null)
    const [applying, setApplying] = useState<TrainingPlan | null>(null)
    const [confirming, setConfirming] = useState<TrainingPlan | null>(null)

    async function reload() {
        setPlans(await listPlans())
    }

    useEffect(() => {
        listPlans()
            .then(setPlans)
            .finally(() => setLoading(false))
    }, [])

    async function handleDelete(plan: TrainingPlan) {
        setPlans((prev) => prev.filter((p) => p._id !== plan._id))
        if (openId === plan._id) setOpenId(null)
        await deletePlan(plan._id)
        toast.show(`Deleted “${plan.name}”.`, 'success')
    }

    async function handleUnapply(plan: TrainingPlan) {
        const removed = await unapplyPlan(plan._id)
        await reload()
        toast.show(
            removed
                ? `Removed ${removed} planned session(s).`
                : 'This plan had nothing on the planner.',
            'success'
        )
    }

    if (importing) {
        return (
            <PlanImportPanel
                onBack={() => setImporting(false)}
                onImported={async () => {
                    await reload()
                    setImporting(false)
                }}
            />
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-xl text-sm text-neutral-500">
                    A plan links every workout, session and routine it needs, and knows which day
                    each one falls on. Apply it to fill the planner.
                </p>
                <Button
                    variant="secondary"
                    icon="fa-solid fa-file-import"
                    onClick={() => setImporting(true)}
                >
                    Import plan
                </Button>
            </div>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : plans.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-map"
                    title="No plans yet"
                    description="Import a plan document to build your first training block. A plan builder is coming — for now, plans are made from JSON."
                    action={
                        <Button icon="fa-solid fa-file-import" onClick={() => setImporting(true)}>
                            Import plan
                        </Button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {plans.map((plan) => (
                        <PlanCard
                            key={plan._id}
                            plan={plan}
                            onOpen={() => setOpenId(plan._id)}
                            onApply={() => setApplying(plan)}
                            onUnapply={() => handleUnapply(plan)}
                            onDelete={() => setConfirming(plan)}
                        />
                    ))}
                </div>
            )}

            <PlanDetailDrawer
                planId={openId}
                onClose={() => setOpenId(null)}
                onApply={(plan) => setApplying(plan)}
            />

            <ApplyPlanModal
                plan={applying}
                onClose={() => setApplying(null)}
                onApplied={async (placed) => {
                    await reload()
                    setApplying(null)
                    toast.show(`Added ${placed} session(s) to the planner.`, 'success')
                }}
            />

            <ConfirmModal
                open={!!confirming}
                title="Delete this plan?"
                message={
                    <>
                        “{confirming?.name}” and any planner entries it placed will be removed. The
                        workouts, sessions and routines it added to your libraries are kept.
                    </>
                }
                confirmLabel="Delete plan"
                danger
                onConfirm={() => {
                    if (confirming) handleDelete(confirming)
                    setConfirming(null)
                }}
                onClose={() => setConfirming(null)}
            />
        </div>
    )
}

// ─── Plan card ──────────────────────────────────────────────────────────────────

function PlanCard({
    plan,
    onOpen,
    onApply,
    onUnapply,
    onDelete,
}: {
    plan: TrainingPlan
    onOpen: () => void
    onApply: () => void
    onUnapply: () => void
    onDelete: () => void
}) {
    const applied = plan.appliedEntries > 0
    const goal = typeof plan.goal?.primaryGoal === 'string' ? plan.goal.primaryGoal : undefined

    return (
        <Card as="div" className="relative flex flex-col gap-3">
            <button
                type="button"
                aria-label={`View ${plan.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />

            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{plan.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                        {formatWeekRange(plan.planStart, plan.planEnd)}
                        {plan.phases.length > 0 && ` · ${plan.phases.length} phases`}
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Plan actions"
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        {
                            label: 'Apply to planner',
                            icon: 'fa-solid fa-calendar-plus',
                            onClick: onApply,
                        },
                        ...(applied
                            ? [
                                  {
                                      label: 'Remove from planner',
                                      icon: 'fa-solid fa-calendar-xmark',
                                      onClick: onUnapply,
                                  },
                              ]
                            : []),
                        {
                            label: 'Delete',
                            icon: 'fa-solid fa-trash-can',
                            danger: true,
                            onClick: onDelete,
                        },
                    ]}
                />
            </div>

            {goal && <p className="line-clamp-2 text-sm text-neutral-500">{goal}</p>}

            <div className="flex flex-wrap gap-1.5">
                {countByKind(plan).map(({ kind, count }) => (
                    <KindChip key={kind} kind={kind} count={count} />
                ))}
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                {applied ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-herb">
                        <i className="fa-solid fa-circle-check" aria-hidden="true" />
                        {plan.appliedEntries} on the planner
                    </span>
                ) : (
                    <span className="text-xs text-neutral-400">Not applied yet</span>
                )}
                {plan.warnings.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                        {plan.warnings.length}
                    </span>
                )}
            </div>
        </Card>
    )
}

// ─── Detail drawer ──────────────────────────────────────────────────────────────

const DETAIL_TABS = ['Overview', 'Week', 'Sessions', 'Schedule'] as const
type DetailTab = (typeof DETAIL_TABS)[number]

function PlanDetailDrawer({
    planId,
    onClose,
    onApply,
}: {
    planId: string | null
    onClose: () => void
    onApply: (plan: TrainingPlan) => void
}) {
    const [plan, setPlan] = useState<TrainingPlan | null>(null)

    // The list endpoint omits the schedule, so fetch the plan in full on open.
    // The previous plan is kept on screen until the new one lands, which also
    // keeps the drawer's content in place while it animates closed.
    useEffect(() => {
        if (!planId) return
        let live = true
        getPlan(planId).then((full) => {
            if (live) setPlan(full)
        })
        return () => {
            live = false
        }
    }, [planId])

    const ready = plan && (!planId || plan._id === planId)

    return (
        <Drawer
            open={!!planId}
            onClose={onClose}
            size="2xl"
            title={ready ? plan.name : 'Plan'}
            footer={
                ready && (
                    <Button
                        icon="fa-solid fa-calendar-plus"
                        onClick={() => {
                            onApply(plan)
                            onClose()
                        }}
                    >
                        Apply to planner
                    </Button>
                )
            }
        >
            {ready ? (
                // Keyed on the plan so switching plans resets the open tab.
                <PlanDetail key={plan._id} plan={plan} />
            ) : (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            )}
        </Drawer>
    )
}

function PlanDetail({ plan }: { plan: TrainingPlan }) {
    const [tab, setTab] = useState<DetailTab>('Overview')

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                    <i className="fa-regular fa-calendar text-neutral-400" aria-hidden="true" />
                    {formatWeekRange(plan.planStart, plan.planEnd)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                    <i className="fa-solid fa-list-check text-neutral-400" aria-hidden="true" />
                    {plan.schedule?.length ?? 0} scheduled sessions
                </span>
                {plan.appliedEntries > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-herb/10 px-2.5 py-1 text-xs font-semibold text-herb">
                        <i className="fa-solid fa-circle-check" aria-hidden="true" />
                        {plan.appliedEntries} on the planner
                    </span>
                )}
            </div>

            {plan.warnings.length > 0 && (
                <Alert variant="warning" title="Some entries could not be scheduled">
                    <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
                        {plan.warnings.map((w, i) => (
                            <li key={i}>{w.message}</li>
                        ))}
                    </ul>
                </Alert>
            )}

            <Tabs
                tabs={[...DETAIL_TABS]}
                value={tab}
                onChange={(t) => setTab(t as DetailTab)}
                className="self-start"
            />

            {tab === 'Overview' ? (
                <OverviewTab plan={plan} />
            ) : tab === 'Week' ? (
                <WeekTab plan={plan} />
            ) : tab === 'Sessions' ? (
                <SessionsTab plan={plan} />
            ) : (
                <ScheduleTab plan={plan} />
            )}
        </div>
    )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {title}
            </p>
            {children}
        </section>
    )
}

function ProseList({ rows }: { rows: { label: string; value: string }[] }) {
    return (
        <dl className="flex flex-col gap-2.5">
            {rows.map((r) => (
                <div key={r.label}>
                    <dt className="text-xs font-semibold text-neutral-500">{r.label}</dt>
                    <dd className="text-sm text-neutral-700">{r.value}</dd>
                </div>
            ))}
        </dl>
    )
}

function OverviewTab({ plan }: { plan: TrainingPlan }) {
    const goalRows = proseRows(plan.goal)
    const progressionRows = proseRows(plan.strengthProgression)
    const checkpoints = Array.isArray(plan.goal?.checkpoints)
        ? (plan.goal.checkpoints as { date?: string; target?: string }[])
        : []
    const measurement = Array.isArray(plan.goal?.measurementProtocol)
        ? (plan.goal.measurementProtocol as string[])
        : []

    return (
        <div className="flex flex-col gap-6">
            {plan.source && <p className="text-sm text-neutral-500">{plan.source}</p>}

            {goalRows.length > 0 && (
                <Section title="Goal">
                    <ProseList rows={goalRows} />
                </Section>
            )}

            {measurement.length > 0 && (
                <Section title="How to measure">
                    <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-neutral-700">
                        {measurement.map((m, i) => (
                            <li key={i}>{m}</li>
                        ))}
                    </ul>
                </Section>
            )}

            {checkpoints.length > 0 && (
                <Section title="Checkpoints">
                    <ol className="flex flex-col gap-2">
                        {checkpoints.map((c, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                                <span className="w-24 shrink-0 font-semibold text-neutral-500">
                                    {c.date}
                                </span>
                                <span className="text-neutral-700">{c.target}</span>
                            </li>
                        ))}
                    </ol>
                </Section>
            )}

            {plan.phases.length > 0 && (
                <Section title="Phases">
                    <ol className="flex flex-col gap-3">
                        {plan.phases.map((p, i) => (
                            <li key={i} className="rounded-xl border border-neutral-200 p-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                    <p className="font-semibold text-neutral-900">{p.name}</p>
                                    {p.dates && (
                                        <p className="text-xs text-neutral-400">{p.dates}</p>
                                    )}
                                </div>
                                {p.focus && (
                                    <p className="mt-1 text-sm text-neutral-600">{p.focus}</p>
                                )}
                                {(p.strength || p.conditioning || p.recoveryPriority) && (
                                    <dl className="mt-2 flex flex-col gap-1 text-xs text-neutral-500">
                                        {p.strength && (
                                            <div>
                                                <dt className="inline font-semibold">Strength: </dt>
                                                <dd className="inline">{p.strength}</dd>
                                            </div>
                                        )}
                                        {p.conditioning && (
                                            <div>
                                                <dt className="inline font-semibold">
                                                    Conditioning:{' '}
                                                </dt>
                                                <dd className="inline">{p.conditioning}</dd>
                                            </div>
                                        )}
                                        {p.recoveryPriority && (
                                            <div>
                                                <dt className="inline font-semibold">Recovery: </dt>
                                                <dd className="inline">{p.recoveryPriority}</dd>
                                            </div>
                                        )}
                                    </dl>
                                )}
                            </li>
                        ))}
                    </ol>
                </Section>
            )}

            {progressionRows.length > 0 && (
                <Section title="Progression rules">
                    <ProseList rows={progressionRows} />
                </Section>
            )}

            {plan.readinessRules.length > 0 && (
                <Section title="Readiness rules">
                    <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-neutral-700">
                        {plan.readinessRules.map((r, i) => (
                            <li key={i}>{r}</li>
                        ))}
                    </ul>
                </Section>
            )}
        </div>
    )
}

function WeekTab({ plan }: { plan: TrainingPlan }) {
    if (plan.weeklyTemplate.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-6 text-center text-xs text-neutral-400">
                This plan has no week-at-a-glance table.
            </p>
        )
    }
    const columns = [
        { key: 'strength', label: 'Strength' },
        { key: 'conditioning', label: 'Conditioning' },
        { key: 'mobility', label: 'Mobility' },
        { key: 'recovery', label: 'Recovery' },
    ] as const

    return (
        <div className="flex flex-col gap-3">
            {plan.weeklyTemplate.map((row) => (
                <div key={row.day} className="rounded-xl border border-neutral-200 p-3">
                    <p className="font-semibold text-neutral-900">{row.day}</p>
                    <dl className="mt-1.5 flex flex-col gap-1 text-sm">
                        {columns.map(({ key, label }) =>
                            row[key] ? (
                                <div key={key} className="flex gap-2">
                                    <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        {label}
                                    </dt>
                                    <dd className="min-w-0 text-neutral-700">{row[key]}</dd>
                                </div>
                            ) : null
                        )}
                    </dl>
                </div>
            ))}
        </div>
    )
}

function SessionsTab({ plan }: { plan: TrainingPlan }) {
    // Group the linked items by the part they play, keeping the plan's own order.
    const groups = useMemo(() => {
        const map = new Map<PlanRole, typeof plan.items>()
        for (const item of plan.items) {
            const list = map.get(item.role) ?? []
            list.push(item)
            map.set(item.role, list)
        }
        return [...map.entries()]
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan.items])

    if (groups.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-6 text-center text-xs text-neutral-400">
                This plan links no library items.
            </p>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            {groups.map(([role, items]) => (
                <Section key={role} title={`${ROLE_LABEL[role]} (${items.length})`}>
                    <ul className="flex flex-col gap-1.5">
                        {items.map((item) => (
                            <li
                                key={item.item}
                                className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm"
                            >
                                <span className="min-w-0 truncate text-neutral-700">
                                    {item.label}
                                </span>
                                {item.created ? (
                                    <span className="shrink-0 text-[11px] font-semibold text-herb">
                                        Added
                                    </span>
                                ) : (
                                    <span className="shrink-0 text-[11px] font-medium text-neutral-400">
                                        Existing
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </Section>
            ))}
        </div>
    )
}

function ScheduleTab({ plan }: { plan: TrainingPlan }) {
    const [from, setFrom] = useState(() => {
        // Open on today when the plan is underway, otherwise on its first day.
        const today = todayKey()
        return today > plan.planStart && today < plan.planEnd ? today : plan.planStart
    })

    // Show four weeks from `from` — enough to read the rhythm without a 900-row list.
    const days = useMemo(() => {
        const schedule = plan.schedule ?? []
        const byDate = new Map<string, PlanScheduleEntry[]>()
        for (const e of schedule) {
            if (e.date < from) continue
            const list = byDate.get(e.date) ?? []
            list.push(e)
            byDate.set(e.date, list)
        }
        return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 28)
    }, [plan, from])

    return (
        <div className="flex flex-col gap-3">
            <div className="w-48">
                <Input
                    label="Show from"
                    type="date"
                    value={from}
                    min={plan.planStart}
                    max={plan.planEnd}
                    onChange={(e) => setFrom(e.target.value || plan.planStart)}
                />
            </div>

            {days.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-6 text-center text-xs text-neutral-400">
                    Nothing scheduled from this date onwards.
                </p>
            ) : (
                days.map(([date, entries]) => (
                    <div key={date} className="rounded-xl border border-neutral-200 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            {formatDateLong(date)}
                        </p>
                        <ul className="mt-1.5 flex flex-col gap-1">
                            {entries.map((e, i) => (
                                <li key={i} className="flex items-baseline gap-2 text-sm">
                                    <i
                                        className={`${KIND_META[e.kind].icon} w-4 shrink-0 text-xs text-neutral-400`}
                                        aria-hidden="true"
                                    />
                                    <span className="min-w-0 text-neutral-700">{e.label}</span>
                                    <span className="ml-auto shrink-0 text-[11px] capitalize text-neutral-400">
                                        {e.part}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            )}
        </div>
    )
}

// ─── Apply modal ────────────────────────────────────────────────────────────────

function ApplyPlanModal({
    plan,
    onClose,
    onApplied,
}: {
    plan: TrainingPlan | null
    onClose: () => void
    onApplied: (placed: number) => void
}) {
    // Keyed on the plan so the dates and checkboxes reset per plan. The modal
    // renders nothing when closed, so unmounting the form costs no animation.
    if (!plan) return null
    return <ApplyPlanForm key={plan._id} plan={plan} onClose={onClose} onApplied={onApplied} />
}

function ApplyPlanForm({
    plan,
    onClose,
    onApplied,
}: {
    plan: TrainingPlan
    onClose: () => void
    onApplied: (placed: number) => void
}) {
    const toast = useToast()

    // Default to the rest of the plan from today, so applying mid-block doesn't
    // backfill days that have already been and gone.
    const [start, setStart] = useState(() => {
        const today = todayKey()
        return today > plan.planStart && today <= plan.planEnd ? today : plan.planStart
    })
    const [end, setEnd] = useState(plan.planEnd)
    const [kinds, setKinds] = useState<FitnessPlanKind[]>([...FITNESS_PLAN_KINDS])
    const [replace, setReplace] = useState(false)
    const [saving, setSaving] = useState(false)

    // The list endpoint omits the schedule, so pull the full plan in to preview
    // how much will land. Until it arrives the count is simply not shown.
    const [schedule, setSchedule] = useState(plan.schedule)
    useEffect(() => {
        if (plan.schedule) return
        let live = true
        getPlan(plan._id).then((full) => {
            if (live) setSchedule(full.schedule)
        })
        return () => {
            live = false
        }
    }, [plan])

    const due = useMemo(() => {
        if (!schedule) return null
        return schedule.filter((e) => e.date >= start && e.date <= end && kinds.includes(e.kind))
            .length
    }, [schedule, start, end, kinds])

    function toggleKind(kind: FitnessPlanKind, on: boolean) {
        setKinds((prev) => (on ? [...prev, kind] : prev.filter((k) => k !== kind)))
    }

    async function submit() {
        if (kinds.length === 0) return
        const options: ApplyPlanOptions = { start, end, kinds, replace }
        setSaving(true)
        try {
            const result = await applyPlan(plan._id, options)
            onApplied(result.placed)
        } catch {
            toast.error('Could not apply the plan.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title="Apply to planner"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || kinds.length === 0}>
                        {saving ? 'Applying…' : 'Apply'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    Adds “{plan.name}” to your weekly planner. Applying again over the same dates
                    replaces what this plan put there before, and leaves anything you placed by hand
                    alone.
                </p>

                <div className="flex gap-3">
                    <div className="flex-1">
                        <Input
                            label="From"
                            type="date"
                            value={start}
                            min={plan.planStart}
                            max={plan.planEnd}
                            onChange={(e) => setStart(e.target.value)}
                        />
                    </div>
                    <div className="flex-1">
                        <Input
                            label="To"
                            type="date"
                            value={end}
                            min={plan.planStart}
                            max={plan.planEnd}
                            onChange={(e) => setEnd(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        What to place
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {FITNESS_PLAN_KINDS.map((kind) => (
                            <Checkbox
                                key={kind}
                                label={KIND_META[kind].label}
                                checked={kinds.includes(kind)}
                                onChange={(on) => toggleKind(kind, on)}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 p-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">
                            Clear the dates first
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-400">
                            Also removes sessions you placed by hand in this window.
                        </p>
                    </div>
                    <Checkbox checked={replace} onChange={setReplace} />
                </div>

                {due !== null && (
                    <Alert variant={due > 0 ? 'info' : 'warning'} icon={null}>
                        {due > 0
                            ? `${due} session${due === 1 ? '' : 's'} will be added to the planner.`
                            : 'Nothing matches these dates and categories.'}
                    </Alert>
                )}
            </div>
        </Modal>
    )
}
