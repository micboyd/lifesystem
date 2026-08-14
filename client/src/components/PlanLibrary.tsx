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
    exportPlan,
    movePlanScheduleEntry,
    type ApplyPlanOptions,
    type ApplyPlanResult,
} from '../services/plans'
import { formatDateLong, formatDateShort, formatWeekRange, todayKey } from '../lib/calendar'
import { findOverloads, findFreeSlot, type Overload } from '../lib/overload'
import { FITNESS_PLAN_KINDS } from '../types'
import type {
    FitnessPlanKind,
    FitnessPlanPart,
    PlanRole,
    PlanScheduleEntry,
    TrainingPlan,
} from '../types'

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

/** The three slots each day splits into, labelled as the planner labels them. */
const PART_META: Record<FitnessPlanPart, { label: string; icon: string }> = {
    morning: { label: 'Morning', icon: 'fa-solid fa-sun' },
    afternoon: { label: 'Afternoon', icon: 'fa-solid fa-cloud-sun' },
    evening: { label: 'Evening', icon: 'fa-solid fa-moon' },
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

/**
 * An imported plan writes its dates as "2026-08-10" throughout its prose — phase
 * ranges, notes, targets. Rewrite every one of them as "10 Aug 2026" so the drawer
 * reads the same way whether a date came from a field or from a sentence.
 */
function readableDates(text: string): string {
    return text.replace(/\d{4}-\d{2}-\d{2}/g, (iso) => formatDateShort(iso))
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
        rows.push({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            value: readableDates(value),
        })
    }
    return rows
}

// ─── Library ────────────────────────────────────────────────────────────────────

export default function PlanLibrary({ onApplied }: { onApplied?: (firstDate: string) => void }) {
    const toast = useToast()
    const [loading, setLoading] = useState(true)
    const [plans, setPlans] = useState<TrainingPlan[]>([])
    const [importing, setImporting] = useState(false)
    const [openId, setOpenId] = useState<string | null>(null)
    const [applying, setApplying] = useState<TrainingPlan | null>(null)
    const [exporting, setExporting] = useState<TrainingPlan | null>(null)
    const [confirming, setConfirming] = useState<TrainingPlan | null>(null)
    // The plan ids the overload drawer is open on — one plan, or every plan.
    // Held as ids rather than plans so the drawer keeps reading the live rows as
    // fixes land. Null keeps it closed.
    const [overloadScope, setOverloadScope] = useState<string[] | null>(null)

    async function reload() {
        setPlans(await listPlans({ schedule: true }))
    }

    useEffect(() => {
        listPlans({ schedule: true })
            .then(setPlans)
            .finally(() => setLoading(false))
    }, [])

    // Overloaded slots per plan, read off each plan's own schedule — so a plan
    // that hasn't been applied yet still shows what it would stack up. Plans
    // with nothing doubled up are absent from the map.
    const overloadsByPlan = useMemo(() => {
        const m = new Map<string, Overload<PlanScheduleEntry>[]>()
        for (const plan of plans) {
            const found = findOverloads(plan.schedule ?? [])
            if (found.length > 0) m.set(plan._id, found)
        }
        return m
    }, [plans])

    const totalOverloads = useMemo(
        () => [...overloadsByPlan.values()].reduce((n, list) => n + list.length, 0),
        [overloadsByPlan]
    )

    // Move one scheduled session to another slot. The plan is the source of
    // truth, so the server rewrites its schedule (and shifts the planner entry
    // it placed, if the plan is applied) and hands back the plan it saved.
    async function handleMoveScheduled(
        plan: TrainingPlan,
        entry: PlanScheduleEntry,
        to: FitnessPlanPart
    ) {
        const saved = await movePlanScheduleEntry(plan._id, {
            date: entry.date,
            item: entry.item,
            from: entry.part,
            to,
        })
        // Only the schedule can have changed; the rest of the row (not least
        // `appliedEntries`, which the list works out) is left as it stands.
        setPlans((prev) =>
            prev.map((p) => (p._id === plan._id ? { ...p, schedule: saved.schedule } : p))
        )
        toast.show(`Moved “${entry.label}” to the ${to}.`, 'success')
    }

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
                existingPlans={plans}
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
                <div className="flex items-center gap-3">
                    {totalOverloads > 0 && (
                        <button
                            type="button"
                            onClick={() => setOverloadScope(plans.map((p) => p._id))}
                            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100"
                        >
                            <i className="fa-solid fa-gauge-high text-xs" aria-hidden="true" />
                            {totalOverloads} overloaded slot{totalOverloads === 1 ? '' : 's'}
                        </button>
                    )}
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-file-import"
                        onClick={() => setImporting(true)}
                    >
                        Import plan
                    </Button>
                </div>
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
                            overloadCount={overloadsByPlan.get(plan._id)?.length ?? 0}
                            onShowOverloads={() => setOverloadScope([plan._id])}
                            onOpen={() => setOpenId(plan._id)}
                            onApply={() => setApplying(plan)}
                            onUnapply={() => handleUnapply(plan)}
                            onExport={() => setExporting(plan)}
                            onDelete={() => setConfirming(plan)}
                        />
                    ))}
                </div>
            )}

            <PlanDetailDrawer
                planId={openId}
                onClose={() => setOpenId(null)}
                onApply={(plan) => setApplying(plan)}
                onExport={(plan) => setExporting(plan)}
            />

            <OverloadDrawer
                open={overloadScope !== null}
                plans={overloadScope ? plans.filter((p) => overloadScope.includes(p._id)) : []}
                overloadsByPlan={overloadsByPlan}
                onMove={handleMoveScheduled}
                onClose={() => setOverloadScope(null)}
            />

            <ExportPlanModal plan={exporting} onClose={() => setExporting(null)} />

            <ApplyPlanModal
                plan={applying}
                onClose={() => setApplying(null)}
                onApplied={async (result) => {
                    await reload()
                    setApplying(null)
                    if (result.placed === 0 || !result.firstDate) {
                        toast.show(
                            'Nothing was added — no sessions fall in those dates.',
                            'warning'
                        )
                        return
                    }
                    // A plan's first session is often days or weeks away, and the
                    // planner opens on this week — so say when it starts, and take
                    // the user there rather than to an empty grid.
                    toast.show(
                        `Added ${result.placed} session(s), starting ${formatDateLong(result.firstDate)}.`,
                        'success'
                    )
                    onApplied?.(result.firstDate)
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
    overloadCount,
    onShowOverloads,
    onOpen,
    onApply,
    onUnapply,
    onExport,
    onDelete,
}: {
    plan: TrainingPlan
    /** How many of this plan's slots stack two hard sessions together. */
    overloadCount: number
    onShowOverloads: () => void
    onOpen: () => void
    onApply: () => void
    onUnapply: () => void
    onExport: () => void
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
                            label: 'Export JSON',
                            icon: 'fa-solid fa-file-export',
                            onClick: onExport,
                        },
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
                <div className="flex items-center gap-2">
                    {overloadCount > 0 && (
                        <button
                            type="button"
                            onClick={onShowOverloads}
                            title={`${overloadCount} overloaded slot${overloadCount === 1 ? '' : 's'}`}
                            className="relative z-20 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                        >
                            <i className="fa-solid fa-gauge-high" aria-hidden="true" />
                            {overloadCount}
                        </button>
                    )}
                    {plan.warnings.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                            {plan.warnings.length}
                        </span>
                    )}
                </div>
            </div>
        </Card>
    )
}

// ─── Overload drawer ────────────────────────────────────────────────────────────

/**
 * Every overloaded slot across one plan or the whole library, in one place: each
 * slot that asks for two hard sessions back to back, listed by plan and then by
 * date, with a one-press move of either session to the nearest slot of its day
 * that's free to take it.
 *
 * Fixes are made against the plan's own schedule rather than a day of the
 * planner, so they hold when the plan is applied again. Calendar events aren't
 * weighed here — a plan spans months, and the planner's clash warning is what
 * catches a session landing on something in the diary.
 */
function OverloadDrawer({
    open,
    plans,
    overloadsByPlan,
    onMove,
    onClose,
}: {
    open: boolean
    /** The plans in scope — one when opened from a card, all from the header. */
    plans: TrainingPlan[]
    overloadsByPlan: Map<string, Overload<PlanScheduleEntry>[]>
    onMove: (
        plan: TrainingPlan,
        entry: PlanScheduleEntry,
        to: FitnessPlanPart
    ) => Promise<void> | void
    onClose: () => void
}) {
    const withOverloads = plans.filter((p) => (overloadsByPlan.get(p._id)?.length ?? 0) > 0)
    const total = withOverloads.reduce((n, p) => n + (overloadsByPlan.get(p._id)?.length ?? 0), 0)

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="2xl"
            title="Overloaded slots"
            badge={total > 0 ? String(total) : undefined}
            footer={
                <Button variant="secondary" onClick={onClose}>
                    Done
                </Button>
            }
        >
            {withOverloads.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <i
                        className="fa-solid fa-circle-check text-2xl text-emerald-500"
                        aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-neutral-700">Nicely spread out</p>
                    <p className="max-w-sm text-sm text-neutral-500">
                        No slot doubles up on hard sessions — strength and conditioning each have a
                        slot to themselves.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    <p className="text-sm text-neutral-500">
                        A slot asking for two hard sessions back to back is flagged here. Moving one
                        rewrites the plan, so the fix holds the next time you apply it — and if the
                        plan is already on the planner, the session moves there too.
                    </p>
                    {withOverloads.map((plan) => (
                        <section key={plan._id} className="flex flex-col gap-3">
                            {/* Only worth naming the plan when several are in scope. */}
                            {plans.length > 1 && (
                                <div className="flex items-baseline gap-2">
                                    <p className="text-sm font-semibold text-neutral-900">
                                        {plan.name}
                                    </p>
                                    <p className="text-xs text-neutral-400">
                                        {overloadsByPlan.get(plan._id)?.length} slot
                                        {overloadsByPlan.get(plan._id)?.length === 1 ? '' : 's'}
                                    </p>
                                </div>
                            )}
                            <ul className="flex flex-col gap-3">
                                {(overloadsByPlan.get(plan._id) ?? []).map((overload) => (
                                    <OverloadRow
                                        key={`${overload.date}|${overload.part}`}
                                        plan={plan}
                                        overload={overload}
                                        onMove={onMove}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </Drawer>
    )
}

/** One overloaded slot: the day and slot it falls in, and the sessions stacked there. */
function OverloadRow({
    plan,
    overload,
    onMove,
}: {
    plan: TrainingPlan
    overload: Overload<PlanScheduleEntry>
    onMove: (
        plan: TrainingPlan,
        entry: PlanScheduleEntry,
        to: FitnessPlanPart
    ) => Promise<void> | void
}) {
    // Which of the slot's sessions is being moved, by position — a plan can name
    // the same item twice, so its id isn't enough to tell them apart. Held so the
    // button can't be pressed again while the save is in flight.
    const [moving, setMoving] = useState<number | null>(null)
    const dayEntries = (plan.schedule ?? []).filter((e) => e.date === overload.date)

    async function handleMove(entry: PlanScheduleEntry, to: FitnessPlanPart, index: number) {
        setMoving(index)
        try {
            await onMove(plan, entry, to)
        } finally {
            setMoving(null)
        }
    }

    return (
        <li className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-800">
                    {formatDateLong(overload.date)}
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-500">
                    <i
                        className={`${PART_META[overload.part].icon} text-[10px]`}
                        aria-hidden="true"
                    />
                    {PART_META[overload.part].label}
                </span>
            </div>
            <div className="mt-2 flex flex-col gap-2 border-t border-violet-200/70 pt-2">
                {overload.entries.map((entry, i) => {
                    const target = findFreeSlot(entry, dayEntries)
                    const busy = moving === i
                    return (
                        <div key={`${entry.item}-${i}`} className="flex items-center gap-2 text-sm">
                            <i
                                className={`${KIND_META[entry.kind].icon} shrink-0 text-xs text-neutral-400`}
                                aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate font-semibold text-neutral-800">
                                {entry.label}
                            </span>
                            {target ? (
                                <button
                                    type="button"
                                    disabled={busy || moving !== null}
                                    onClick={() => handleMove(entry, target, i)}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-violet-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
                                >
                                    <i
                                        className={`text-[11px] ${
                                            busy
                                                ? 'fa-solid fa-circle-notch fa-spin'
                                                : 'fa-solid fa-arrow-right-long'
                                        }`}
                                        aria-hidden="true"
                                    />
                                    Move to {PART_META[target].label}
                                </button>
                            ) : (
                                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-neutral-400">
                                    <i className="fa-solid fa-ban text-[11px]" aria-hidden="true" />
                                    No free slot
                                </span>
                            )}
                        </div>
                    )
                })}
            </div>
        </li>
    )
}

// ─── Detail drawer ──────────────────────────────────────────────────────────────

const DETAIL_TABS = ['Overview', 'Week', 'Sessions', 'Schedule'] as const
type DetailTab = (typeof DETAIL_TABS)[number]

function PlanDetailDrawer({
    planId,
    onClose,
    onApply,
    onExport,
}: {
    planId: string | null
    onClose: () => void
    onApply: (plan: TrainingPlan) => void
    onExport: (plan: TrainingPlan) => void
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
                    <>
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-file-export"
                            onClick={() => {
                                onExport(plan)
                                onClose()
                            }}
                        >
                            Export JSON
                        </Button>
                        <Button
                            icon="fa-solid fa-calendar-plus"
                            onClick={() => {
                                onApply(plan)
                                onClose()
                            }}
                        >
                            Apply to planner
                        </Button>
                    </>
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
                            <li key={i}>{readableDates(w.message)}</li>
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
            {plan.source && (
                <p className="text-sm text-neutral-500">{readableDates(plan.source)}</p>
            )}

            {goalRows.length > 0 && (
                <Section title="Goal">
                    <ProseList rows={goalRows} />
                </Section>
            )}

            {measurement.length > 0 && (
                <Section title="How to measure">
                    <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-neutral-700">
                        {measurement.map((m, i) => (
                            <li key={i}>{readableDates(m)}</li>
                        ))}
                    </ul>
                </Section>
            )}

            {checkpoints.length > 0 && (
                <Section title="Checkpoints">
                    <ol className="flex flex-col gap-2">
                        {checkpoints.map((c, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                                <span className="w-28 shrink-0 font-semibold text-neutral-500">
                                    {c.date ? formatDateShort(c.date) : ''}
                                </span>
                                <span className="text-neutral-700">
                                    {c.target ? readableDates(c.target) : ''}
                                </span>
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
                                        <p className="text-xs text-neutral-400">
                                            {readableDates(p.dates)}
                                        </p>
                                    )}
                                </div>
                                {p.focus && (
                                    <p className="mt-1 text-sm text-neutral-600">
                                        {readableDates(p.focus)}
                                    </p>
                                )}
                                {(p.strength || p.conditioning || p.recoveryPriority) && (
                                    <dl className="mt-2 flex flex-col gap-1 text-xs text-neutral-500">
                                        {p.strength && (
                                            <div>
                                                <dt className="inline font-semibold">Strength: </dt>
                                                <dd className="inline">
                                                    {readableDates(p.strength)}
                                                </dd>
                                            </div>
                                        )}
                                        {p.conditioning && (
                                            <div>
                                                <dt className="inline font-semibold">
                                                    Conditioning:{' '}
                                                </dt>
                                                <dd className="inline">
                                                    {readableDates(p.conditioning)}
                                                </dd>
                                            </div>
                                        )}
                                        {p.recoveryPriority && (
                                            <div>
                                                <dt className="inline font-semibold">Recovery: </dt>
                                                <dd className="inline">
                                                    {readableDates(p.recoveryPriority)}
                                                </dd>
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

            {plan.overrides.length > 0 && (
                <Section title={`Dated exceptions (${plan.overrides.length})`}>
                    <ol className="flex flex-col gap-2">
                        {plan.overrides.map((o, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                                <span className="w-40 shrink-0 text-xs font-semibold text-neutral-500">
                                    {o.start === o.end
                                        ? formatDateShort(o.start)
                                        : formatWeekRange(o.start, o.end)}
                                </span>
                                <span className="min-w-0 text-neutral-700">
                                    {readableDates(o.summary)}
                                    {o.notes && (
                                        <span className="text-neutral-400">
                                            {' '}
                                            — {readableDates(o.notes)}
                                        </span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ol>
                </Section>
            )}

            {plan.readinessRules.length > 0 && (
                <Section title="Readiness rules">
                    <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-neutral-700">
                        {plan.readinessRules.map((r, i) => (
                            <li key={i}>{readableDates(r)}</li>
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
                        {columns.map(({ key, label }) => {
                            const value = row[key]
                            return value ? (
                                <div key={key} className="flex gap-2">
                                    <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        {label}
                                    </dt>
                                    <dd className="min-w-0 text-neutral-700">
                                        {readableDates(value)}
                                    </dd>
                                </div>
                            ) : null
                        })}
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
                                    {readableDates(item.label)}
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

    // The last override covering a day, matching the import's "later wins" rule.
    const overrideOn = (date: string) =>
        [...plan.overrides].reverse().find((o) => date >= o.start && date <= o.end) ?? null

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
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                {formatDateShort(date)}
                            </p>
                            {overrideOn(date) && (
                                <span className="text-[11px] font-semibold text-amber-700">
                                    Exception ·{' '}
                                    {readableDates(
                                        overrideOn(date)!.notes ?? overrideOn(date)!.summary
                                    )}
                                </span>
                            )}
                        </div>
                        <ul className="mt-1.5 flex flex-col gap-1">
                            {entries.map((e, i) => (
                                <li key={i} className="flex items-baseline gap-2 text-sm">
                                    <i
                                        className={`${KIND_META[e.kind].icon} w-4 shrink-0 text-xs text-neutral-400`}
                                        aria-hidden="true"
                                    />
                                    <span className="min-w-0 text-neutral-700">
                                        {readableDates(e.label)}
                                    </span>
                                    <span className="ml-auto shrink-0 text-[11px] capitalize text-neutral-400">
                                        {e.part}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {entries.some((e) => e.notes) && (
                            <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-neutral-100 pt-1.5">
                                {[
                                    ...new Set(
                                        entries.map((e) => e.notes).filter((n): n is string => !!n)
                                    ),
                                ].map((note) => (
                                    <li key={note} className="text-[11px] text-neutral-400">
                                        {readableDates(note)}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))
            )}
        </div>
    )
}

// ─── Export modal ───────────────────────────────────────────────────────────────

/** "Winter Strength Block" → "winter-strength-block.json". */
function fileNameFor(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    return `${slug || 'training-plan'}.json`
}

function ExportPlanModal({ plan, onClose }: { plan: TrainingPlan | null; onClose: () => void }) {
    // Keyed on the plan so re-opening on another one refetches. The modal renders
    // nothing when closed, so unmounting costs no animation.
    if (!plan) return null
    return <ExportPlanBody key={plan._id} plan={plan} onClose={onClose} />
}

/**
 * The plan rebuilt as an import document, ready to copy or save. Round-trips:
 * pasting it back into the importer over the same plan rebuilds it, so this is
 * how a plan gets edited as a whole rather than a session at a time.
 */
function ExportPlanBody({ plan, onClose }: { plan: TrainingPlan; onClose: () => void }) {
    const toast = useToast()
    const [json, setJson] = useState<string | null>(null)
    const [warnings, setWarnings] = useState<string[]>([])
    const [failed, setFailed] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let live = true
        exportPlan(plan._id)
            .then((result) => {
                if (!live) return
                setJson(JSON.stringify(result.document, null, 2))
                setWarnings(result.warnings)
            })
            .catch(() => {
                if (live) setFailed(true)
            })
        return () => {
            live = false
        }
    }, [plan._id])

    async function copy() {
        if (!json) return
        try {
            await navigator.clipboard.writeText(json)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    function download() {
        if (!json) return
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = fileNameFor(plan.name)
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <Modal
            open
            onClose={onClose}
            size="lg"
            title="Export plan"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        variant="secondary"
                        icon={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'}
                        onClick={copy}
                        disabled={!json}
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button icon="fa-solid fa-download" onClick={download} disabled={!json}>
                        Download
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-sm text-neutral-500">
                    “{plan.name}” in the same shape the importer takes. Edit it and paste it back in
                    — the importer offers to replace this plan rather than add a second one. The
                    workouts, sessions and routines are written out as they stand in your libraries
                    now, so anything you have changed since importing comes back changed.
                </p>

                {failed && <Alert variant="danger">Could not build the export.</Alert>}

                {warnings.length > 0 && (
                    <Alert variant="warning" title="Some things could not be exported">
                        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
                            {warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    </Alert>
                )}

                {json === null && !failed ? (
                    <div className="grid place-items-center py-16">
                        <Spinner />
                    </div>
                ) : (
                    json !== null && (
                        <pre className="max-h-[45vh] overflow-auto rounded-xl bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
                            <code>{json}</code>
                        </pre>
                    )
                )}
            </div>
        </Modal>
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
    onApplied: (result: ApplyPlanResult) => void
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
    onApplied: (result: ApplyPlanResult) => void
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
            onApplied(result)
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
