import { useEffect, useState } from 'react'
import Button from '../Button'
import Spinner from '../Spinner'
import EmptyState from '../EmptyState'
import PillToggle from '../PillToggle'
import { addMonths } from '../../lib/finance'
import { formatAmount } from '../../lib/money'
import {
    combinedMonthly,
    finishMilestones,
    isIncluded,
    monthsUntil,
    nextChange,
    planStatus,
    sortPlans,
} from '../../lib/savingsPlans'
import {
    listSavingsTargets,
    createSavingsTarget,
    updateSavingsTarget,
    deleteSavingsTarget,
    type SavingsTargetInput,
} from '../../services/savingsTargets'
import { useToast } from '../../context/ToastContext'
import { BigFigure, Money, OVERLINE, Stat, monthLabelLong, monthLabelShort } from './savingsFigures'
import PlanDrawer, { type PlanAccount, type PlanDrawerState } from './PlanDrawer'
import type { SavingsTarget } from '../../types'

/**
 * Finances → Savings forecast → Target planner.
 *
 * Leads with what all your plans need each month against what the Monthly
 * sheet actually puts into savings, charts that month by month, then lists
 * the plans (tap one to edit it) and when each finishes. Plans are created
 * and edited in PlanDrawer.
 */

// Categorical hues in a fixed order (validated palette), handed out by when a
// plan was created so a plan keeps its colour when others come and go.
const PLAN_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

const CHART_YEARS = [1, 3, 5] as const
type ChartYears = (typeof CHART_YEARS)[number]

const fmt = formatAmount

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function mo(n: number) {
    return Math.abs(n) === 1 ? 'month' : 'months'
}

export default function TargetPlanner({
    accounts,
    defaultRate,
    sheetMonthlyFor,
}: {
    /** Savings accounts, for "already saved" shortcuts in the drawer. */
    accounts: PlanAccount[]
    /** Blended rate across savings accounts — the drawer's starting rate. */
    defaultRate: number
    /** What the Monthly sheet puts into savings in a given month. */
    sheetMonthlyFor: (month: string) => number
}) {
    const toast = useToast()
    const now = currentMonth()
    const [plans, setPlans] = useState<SavingsTarget[]>([])
    const [loading, setLoading] = useState(true)
    const [drawer, setDrawer] = useState<PlanDrawerState | null>(null)
    const [years, setYears] = useState<ChartYears>(3)

    useEffect(() => {
        let active = true
        listSavingsTargets()
            .then((t) => active && setPlans(t))
            .catch(() => active && toast.error("Couldn't load your plans."))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const byAge = [...plans].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    const colorFor = new Map(byAge.map((p, i) => [p._id, PLAN_COLORS[i % PLAN_COLORS.length]]))

    const sorted = sortPlans(plans)
    const active = sorted.filter((p) => p.targetMonth >= now)
    const finished = sorted.filter((p) => p.targetMonth < now)
    const counted = active.filter(isIncluded)

    const needNow = combinedMonthly(counted, now)
    const sheetNow = sheetMonthlyFor(now)
    const gap = sheetNow - needNow
    const change = nextChange(counted, now)
    const totalAimed = counted.reduce((s, p) => s + p.targetAmount, 0)

    async function handleSave(id: string | null, fields: SavingsTargetInput | Partial<SavingsTargetInput>) {
        try {
            if (id) {
                const updated = await updateSavingsTarget(id, fields)
                setPlans((prev) => prev.map((p) => (p._id === id ? updated : p)))
                toast.show('Plan updated.', 'success')
            } else {
                const created = await createSavingsTarget(fields as SavingsTargetInput)
                setPlans((prev) => [...prev, created])
                toast.show('Plan saved.', 'success')
            }
            setDrawer(null)
        } catch {
            toast.error("Couldn't save that plan.")
        }
    }

    async function handleDelete(id: string) {
        try {
            await deleteSavingsTarget(id)
            setPlans((prev) => prev.filter((p) => p._id !== id))
            setDrawer(null)
            toast.show('Plan deleted.', 'success')
        } catch {
            toast.error("Couldn't delete that plan.")
        }
    }

    const newPlan = () => setDrawer({ plan: null })

    const drawerEl = (
        <PlanDrawer
            state={drawer}
            accounts={accounts}
            defaultRate={defaultRate}
            onClose={() => setDrawer(null)}
            onSave={handleSave}
            onDelete={handleDelete}
        />
    )

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    if (plans.length === 0) {
        return (
            <>
                <EmptyState
                    icon="fa-solid fa-bullseye"
                    title="Plan what you're saving for"
                    description="Give it a target and a date to see what to put away each month — or start from what you can save and see where it lands."
                    action={<Button icon="fa-solid fa-plus" onClick={newPlan}>New plan</Button>}
                />
                {drawerEl}
            </>
        )
    }

    return (
        <>
            {/* Hero — what your plans need each month vs what the sheet saves */}
            <section className="mb-8 border-b border-hairline pb-8">
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
                    <div className="flex min-w-0 flex-col gap-6">
                        <BigFigure
                            label="Your plans need"
                            value={
                                <>
                                    <Money v={needNow} />
                                    <span className="ml-2 text-lg font-medium tracking-normal text-neutral-500">a month</span>
                                </>
                            }
                            sub={
                                counted.length === 0
                                    ? 'No plans are counted — switch one on in its settings.'
                                    : change
                                      ? (
                                            <>
                                                {change.to > change.from ? 'Goes up' : 'Drops'} to <Money v={change.to} /> in{' '}
                                                {monthLabelLong(change.month)}
                                                {change.starting.length > 0
                                                    ? ` when ${change.starting.map((p) => p.name).join(' and ')} starts`
                                                    : change.ending.length > 0
                                                      ? ` after ${change.ending.map((p) => p.name).join(' and ')} finishes`
                                                      : ''}
                                                .
                                            </>
                                        )
                                      : `Across ${counted.length} ${counted.length === 1 ? 'plan' : 'plans'}, steady to the end.`
                            }
                        />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                            <Stat label="Sheet saves" value={<Money v={sheetNow} />} sub="a month, from Monthly" />
                            <Stat
                                label={Math.abs(gap) < 0.5 ? 'Balance' : gap < 0 ? 'Short' : 'Spare'}
                                tone={Math.abs(gap) < 0.5 ? 'default' : gap < 0 ? 'bad' : 'good'}
                                value={Math.abs(gap) < 0.5 ? 'Just enough' : <Money v={Math.abs(gap)} />}
                                sub={gap < -0.5 ? 'more needed each month' : gap > 0.5 ? 'left after your plans' : 'plans match your sheet'}
                            />
                            <Stat label="Aiming for" value={<Money v={totalAimed} />} sub={`${counted.length} ${counted.length === 1 ? 'plan' : 'plans'} counted`} />
                        </div>
                    </div>

                    <div className="min-w-0">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h2 className={OVERLINE}>Each month</h2>
                            <PillToggle
                                label="Chart length"
                                options={CHART_YEARS.map((y) => ({ value: y, label: y === 1 ? '1 yr' : `${y} yrs` }))}
                                value={years}
                                onChange={setYears}
                            />
                        </div>
                        <CommitmentChart
                            plans={counted}
                            colorFor={colorFor}
                            sheetMonthlyFor={sheetMonthlyFor}
                            now={now}
                            months={years * 12}
                        />
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.5fr_1fr]">
                {/* Plans */}
                <section className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className={OVERLINE}>Plans</h2>
                        <Button size="sm" icon="fa-solid fa-plus" onClick={newPlan}>
                            New plan
                        </Button>
                    </div>
                    <ul className="divide-y divide-neutral-100 border-t border-hairline">
                        {active.map((p) => (
                            <PlanRow key={p._id} plan={p} color={colorFor.get(p._id)!} now={now} onOpen={() => setDrawer({ plan: p })} />
                        ))}
                    </ul>
                    {active.length === 0 && (
                        <p className="py-4 text-sm text-neutral-500">Nothing running — every plan has finished.</p>
                    )}

                    {finished.length > 0 && (
                        <>
                            <h3 className={`mb-2 mt-8 ${OVERLINE}`}>Finished</h3>
                            <ul className="divide-y divide-neutral-100 border-t border-hairline">
                                {finished.map((p) => (
                                    <PlanRow key={p._id} plan={p} color={colorFor.get(p._id)!} now={now} onOpen={() => setDrawer({ plan: p })} />
                                ))}
                            </ul>
                        </>
                    )}
                </section>

                {/* When each finishes */}
                {counted.length > 0 && <Milestones plans={counted} colorFor={colorFor} now={now} />}
            </div>

            {drawerEl}
        </>
    )
}

// ── Plan row ─────────────────────────────────────────────────────────────────

function PlanRow({ plan, color, now, onOpen }: { plan: SavingsTarget; color: string; now: string; onOpen: () => void }) {
    const counted = isIncluded(plan)
    const status = planStatus(plan, now)
    const fixed = plan.mode === 'contribution'
    const toneClass =
        status.tone === 'soon' ? 'text-amber-700' : status.tone === 'done' ? 'text-emerald-700' : 'text-neutral-500'

    return (
        <li>
            <button
                type="button"
                onClick={onOpen}
                className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-neutral-50 sm:px-2"
            >
                <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: counted ? color : 'transparent', boxShadow: counted ? undefined : `inset 0 0 0 1.5px ${color}` }}
                    aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className={`truncate text-[15px] font-medium ${counted ? 'text-neutral-950' : 'text-neutral-500'}`}>
                            {plan.name}
                        </span>
                        {plan.priority && (
                            <i className="fa-solid fa-flag shrink-0 text-[11px] text-amber-500" aria-label="Priority" />
                        )}
                        {!counted && (
                            <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                                Not counted
                            </span>
                        )}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                        <Money v={plan.targetAmount} /> by {monthLabelShort(plan.targetMonth)}
                        {' · '}
                        <span className={toneClass}>{status.text}</span>
                    </span>
                </span>
                <span className="shrink-0 text-right">
                    {plan.onTrack ? (
                        <span className="text-[15px] font-medium text-emerald-600">On track</span>
                    ) : (
                        <>
                            <span className="block text-[15px] font-medium text-neutral-950">
                                <Money v={plan.requiredMonthly} />
                            </span>
                            <span className="block text-[11px] text-neutral-500">{fixed ? 'fixed a month' : 'a month'}</span>
                        </>
                    )}
                </span>
                <i className="fa-solid fa-chevron-right shrink-0 text-[11px] text-neutral-400" aria-hidden="true" />
            </button>
        </li>
    )
}

// ── Chart: what plans need each month, against what the sheet saves ──────────

function CommitmentChart({
    plans,
    colorFor,
    sheetMonthlyFor,
    now,
    months,
}: {
    plans: SavingsTarget[]
    colorFor: Map<string, string>
    sheetMonthlyFor: (m: string) => number
    now: string
    months: number
}) {
    const [picked, setPicked] = useState<number | null>(null)
    const cols = Array.from({ length: months }, (_, i) => {
        const m = addMonths(now, i)
        const parts = plans
            .map((p) => ({ plan: p, value: p.onTrack ? 0 : m >= p.startMonth && m <= p.targetMonth ? p.requiredMonthly : 0 }))
            .filter((x) => x.value > 0)
        return { m, parts, total: parts.reduce((s, x) => s + x.value, 0), sheet: sheetMonthlyFor(m) }
    })
    const top = Math.max(1, ...cols.map((c) => Math.max(c.total, c.sheet))) * 1.1
    const shown = cols[picked ?? 0]
    const gap = shown.sheet - shown.total
    const pct = (v: number) => `${(v / top) * 100}%`

    return (
        <div>
            {/* Readout — this month by default, the hovered/tapped month otherwise */}
            <div className="mb-3 min-h-[40px] text-[13px]" aria-live="polite">
                <p className="font-medium text-neutral-900">
                    {picked === null ? `This month · ${monthLabelShort(shown.m)}` : monthLabelLong(shown.m)}
                </p>
                <p className="text-neutral-500">
                    Plans <Money v={shown.total} /> · sheet <Money v={shown.sheet} /> ·{' '}
                    <span className={gap < -0.5 ? 'text-red-600' : gap > 0.5 ? 'text-emerald-700' : ''}>
                        {Math.abs(gap) < 0.5 ? 'just enough' : gap < 0 ? <><Money v={-gap} /> short</> : <><Money v={gap} /> spare</>}
                    </span>
                </p>
            </div>

            <div
                className="relative h-44 sm:h-52"
                role="img"
                aria-label="What your plans need each month, stacked by plan, with what your sheet puts into savings as a line"
                onMouseLeave={() => setPicked(null)}
            >
                <span className="absolute -top-0.5 left-0 text-[11px] text-neutral-400 tabular-nums">£{fmt(top / 1.1, 0)}</span>
                <div className="absolute inset-x-0 top-0 h-px bg-neutral-100" style={{ top: `${100 - (100 / 1.1)}%` }} />
                <div className="absolute inset-x-0 bottom-0 h-px bg-neutral-200" />
                <div className={`absolute inset-0 flex items-end ${months > 24 ? 'gap-px' : 'gap-[2px]'}`}>
                    {cols.map((c, i) => (
                        <button
                            key={c.m}
                            type="button"
                            onMouseEnter={() => setPicked(i)}
                            onFocus={() => setPicked(i)}
                            onClick={() => setPicked(i)}
                            aria-label={`${monthLabelLong(c.m)}: plans £${fmt(c.total, 0)}, sheet £${fmt(c.sheet, 0)}`}
                            className={`relative flex h-full min-w-0 flex-1 flex-col-reverse justify-start gap-[2px] ${
                                picked === i ? 'bg-neutral-100' : ''
                            }`}
                        >
                            {c.parts.map((x, k) => (
                                <span
                                    key={x.plan._id}
                                    className={`block w-full shrink-0 ${k === c.parts.length - 1 ? 'rounded-t-[3px]' : ''}`}
                                    style={{ height: pct(x.value), background: colorFor.get(x.plan._id) }}
                                />
                            ))}
                            {c.sheet > 0 && (
                                <span
                                    className="pointer-events-none absolute inset-x-0 h-[2px] bg-neutral-900"
                                    style={{ bottom: `calc(${pct(c.sheet)} - 1px)` }}
                                />
                            )}
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-neutral-500">
                <span>{monthLabelShort(cols[0].m)}</span>
                <span>{monthLabelShort(cols[cols.length - 1].m)}</span>
            </div>

            {/* Legend — names never rely on colour alone */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-600">
                <span className="inline-flex items-center gap-2">
                    <span className="h-[2px] w-4 bg-neutral-900" aria-hidden="true" />
                    Sheet saves
                </span>
                {plans.filter((p) => !p.onTrack).map((p) => (
                    <span key={p._id} className="inline-flex min-w-0 items-center gap-2">
                        <span className="h-2 w-3 shrink-0 rounded-sm" style={{ background: colorFor.get(p._id) }} aria-hidden="true" />
                        <span className="truncate">{p.name}</span>
                    </span>
                ))}
            </div>
        </div>
    )
}

// ── When each plan finishes ──────────────────────────────────────────────────

function Milestones({ plans, colorFor, now }: { plans: SavingsTarget[]; colorFor: Map<string, string>; now: string }) {
    const items = finishMilestones(plans, now)
    return (
        <section className="min-w-0">
            <h2 className={`mb-3 ${OVERLINE}`}>When each finishes</h2>
            <ol className="border-t border-hairline pt-4">
                {items.map((ev, i) => {
                    const before = combinedMonthly(plans, ev.month)
                    const changed = Math.abs(ev.monthlyAfter - before) > 0.5
                    return (
                        <li key={ev.plan._id} className="relative flex gap-4 pb-6 last:pb-0">
                            {i < items.length - 1 && (
                                <span className="absolute bottom-0 left-[5px] top-4 w-px bg-neutral-200" aria-hidden="true" />
                            )}
                            <span
                                className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full"
                                style={{ background: colorFor.get(ev.plan._id) }}
                                aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-neutral-500">
                                    {monthLabelLong(ev.month)} ·{' '}
                                    {ev.monthsAway === 0 ? 'this month' : `in ${ev.monthsAway} ${mo(ev.monthsAway)}`}
                                </p>
                                <p className="mt-0.5 text-[15px] text-neutral-900">
                                    <span className="font-medium">{ev.plan.name}</span> — <Money v={ev.plan.targetAmount} /> ready
                                </p>
                                {changed && (
                                    <p className="mt-0.5 text-[13px] text-neutral-500">
                                        {ev.monthlyAfter === 0 ? (
                                            'Nothing left to put away after this'
                                        ) : (
                                            <>
                                                Monthly saving then {ev.monthlyAfter < before ? 'drops' : 'goes'} to <Money v={ev.monthlyAfter} />
                                            </>
                                        )}
                                    </p>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ol>
            {items.length > 0 && monthsUntil(now, items[items.length - 1].month) > 0 && (
                <p className="mt-5 text-xs text-neutral-500">
                    Amounts are what each plan needed when it was worked out. Open a plan to re-work it from today.
                </p>
            )}
        </section>
    )
}
