import { useCallback, useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import Tabs from '../components/Tabs'
import Button from '../components/Button'
import Select from '../components/Select'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import DropdownMenu from '../components/DropdownMenu'
import { MoreButton, OVERLINE, PANEL, colorClasses } from '../components/lifeplan/ui'
import LifePlanTimeline from '../components/lifeplan/LifePlanTimeline'
import TimelineMonthList from '../components/lifeplan/TimelineMonthList'
import LaneItemDrawer from '../components/lifeplan/LaneItemDrawer'
import SeasonsTab from '../components/lifeplan/SeasonsTab'
import SeasonForm from '../components/lifeplan/SeasonForm'
import PressureCheck from '../components/lifeplan/PressureCheck'
import SeasonReviewTab from '../components/lifeplan/SeasonReviewTab'
import PlanForm from '../components/lifeplan/PlanForm'
import LoadPill from '../components/lifeplan/LoadPill'
import MonthLoadDrawer from '../components/lifeplan/MonthLoadDrawer'
import ReserveMeter from '../components/lifeplan/ReserveMeter'
import {
    LIFE_PILLARS,
    type Goal,
    type LifePlan as LifePlanType,
    type LifePlanInput,
    type MonthNote,
    type NutritionPhase,
    type SavingsTarget,
    type Season,
    type SeasonInput,
    type SeasonReview,
    type TrainingPlan,
} from '../types'
import { formatMonthKey, formatMonthRange, monthKey, todayKey } from '../lib/calendar'
import { activePlan, buildTimeline, monthRange, seasonForMonth, seasonProgress, type LaneItem } from '../lib/lifeTimeline'
import { RESERVE_LABELS, computeMonthLoads } from '../lib/lifeLoad'
import { useLoadCapacities } from '../components/lifeplan/useLoadCapacities'
import { buildScorecard, monthEndDate, monthStartDate, type SeasonScorecard } from '../lib/seasonReview'
import * as lifePlans from '../services/lifePlans'
import * as phaseService from '../services/nutritionPhases'
import { listPlans } from '../services/plans'
import { listSavingsTargets } from '../services/savingsTargets'
import { listGoals } from '../services/goals'
import { listMonthNotes } from '../services/monthNotes'
import { listPlanEntries as listFitnessEntries } from '../services/fitnessPlan'
import { listPlanEntries as listMealEntries } from '../services/mealPlan'
import { listLogs as listWorkoutLogs } from '../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../services/conditioningLogs'
import { listWeightLogs } from '../services/weightLogs'
import { listHabits, listLogs as listHabitLogs } from '../services/habits'

/**
 * Life Plan: the long-horizon layer.
 *
 * Home answers "what do I do now" and the module pages each own a week. This one
 * owns quarters and years, and it's the only place the domains are drawn against
 * each other — which is what makes "is October actually survivable" a question the
 * app can answer.
 */

const TABS = ['Timeline', 'Seasons', 'Pressure', 'Review'] as const
type Tab = (typeof TABS)[number]

/** Everything the timeline and the pressure check read, none of it owned here. */
interface LinkedRecords {
    trainingPlans: TrainingPlan[]
    nutritionPhases: NutritionPhase[]
    savingsTargets: SavingsTarget[]
    monthNotes: MonthNote[]
    goals: Goal[]
    /** Dates of every logged session — tells a new routine from a new block. */
    trainingDates: string[]
}

const EMPTY_RECORDS: LinkedRecords = {
    trainingPlans: [],
    nutritionPhases: [],
    savingsTargets: [],
    monthNotes: [],
    goals: [],
    trainingDates: [],
}

/** The message an API error carries, or a fallback. */
function errorMessage(err: unknown, fallback: string): string {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    return message ?? fallback
}

export default function LifePlan() {
    const [tab, setTab] = useState<Tab>('Timeline')
    const [plans, setPlans] = useState<LifePlanType[]>([])
    const [planId, setPlanId] = useState<string | null>(null)
    const [records, setRecords] = useState<LinkedRecords>(EMPTY_RECORDS)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Plan editing
    const [planFormOpen, setPlanFormOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState<LifePlanType | null>(null)
    const [planSaving, setPlanSaving] = useState(false)
    const [planError, setPlanError] = useState<string | null>(null)
    const [deletingPlan, setDeletingPlan] = useState<LifePlanType | null>(null)

    // Season editing
    const [seasonFormOpen, setSeasonFormOpen] = useState(false)
    const [editingSeason, setEditingSeason] = useState<Season | null>(null)
    const [seasonSaving, setSeasonSaving] = useState(false)
    const [seasonError, setSeasonError] = useState<string | null>(null)
    const [deletingSeason, setDeletingSeason] = useState<Season | null>(null)
    /** Months a new season opens on, when it's started from a gap. */
    const [seasonPreset, setSeasonPreset] = useState<{ startMonth: string; endMonth: string } | null>(null)

    // Timeline drawer
    const [selectedItem, setSelectedItem] = useState<LaneItem | null>(null)
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

    // Review
    const [reviewSeasonId, setReviewSeasonId] = useState<string | null>(null)
    const [scorecard, setScorecard] = useState<SeasonScorecard | null>(null)
    const [reviewLoading, setReviewLoading] = useState(false)
    const [reviewSaving, setReviewSaving] = useState(false)
    const [reviewError, setReviewError] = useState<string | null>(null)

    const thisMonth = useMemo(() => {
        const now = new Date()
        return monthKey(now.getFullYear(), now.getMonth())
    }, [])

    // Load the plans and everything the lanes read, in one pass. Month flags need
    // a window, so they're fetched once a plan is known.
    useEffect(() => {
        let cancelled = false
        Promise.all([lifePlans.listLifePlans(), listPlans(), phaseService.listNutritionPhases(), listSavingsTargets(), listGoals()])
            .then(([loadedPlans, trainingPlans, nutritionPhases, savingsTargets, goals]) => {
                if (cancelled) return
                // Pillars outlive the modules behind them (Work went in 2026-10), so
                // anything the app no longer knows is dropped rather than drawn as
                // an empty, unlabelled lane.
                const known = loadedPlans.map((p) => ({
                    ...p,
                    pillars: p.pillars.filter((pillar) => LIFE_PILLARS.includes(pillar)),
                    seasons: p.seasons.map((s) => ({
                        ...s,
                        intent: s.intent.filter((i) => LIFE_PILLARS.includes(i.pillar)),
                    })),
                }))
                setPlans(known)
                setPlanId((current) => current ?? activePlan(known, thisMonth)?._id ?? null)
                setRecords((r) => ({ ...r, trainingPlans, nutritionPhases, savingsTargets, goals }))
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'Could not load the life plan.'))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [thisMonth])

    // The training history that says whether a plan starts a routine or continues
    // one. Not worth failing the page over.
    useEffect(() => {
        let cancelled = false
        Promise.all([listWorkoutLogs(), listConditioningLogs()])
            .then(([workoutLogs, conditioningLogs]) => {
                if (cancelled) return
                const trainingDates = [...workoutLogs, ...conditioningLogs].map((l) => l.date)
                setRecords((r) => ({ ...r, trainingDates }))
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [])

    const plan = plans.find((p) => p._id === planId) ?? null
    const planStart = plan?.start
    const planEnd = plan?.end

    // Month flags are fetched per plan window rather than all at once — the
    // calendar can hold years of them and only the plan's own months matter here.
    useEffect(() => {
        if (!planStart || !planEnd) return
        let cancelled = false
        listMonthNotes(planStart, planEnd)
            .then((monthNotes) => {
                if (!cancelled) setRecords((r) => ({ ...r, monthNotes }))
            })
            .catch(() => {
                // A missing flag layer shouldn't take the whole timeline down.
            })
        return () => {
            cancelled = true
        }
    }, [planStart, planEnd])

    const timelineInput = useMemo(
        () => (plan ? { plan, ...records } : null),
        [plan, records]
    )
    const timeline = useMemo(
        () => (timelineInput ? buildTimeline(timelineInput) : null),
        [timelineInput]
    )

    // The denominators: free cash and measured maintenance with the page, fitted
    // ceilings once the Pressure tab asks for them.
    const capacities = useLoadCapacities(plan?.start, plan?.end, records, tab === 'Pressure')

    const loadInput = useMemo(
        () =>
            timelineInput
                ? {
                      ...timelineInput,
                      freeCash: capacities.freeCash,
                      maintenanceKcal: capacities.maintenanceKcal,
                      capacities: capacities.capacities,
                  }
                : null,
        [timelineInput, capacities]
    )
    const loads = useMemo(() => (loadInput ? computeMonthLoads(loadInput) : []), [loadInput])

    const currentSeason = plan ? seasonForMonth(plan, thisMonth) : undefined
    const currentLoad = loads.find((l) => l.month === thisMonth)

    // Default the review to the season covering today, else the last one written.
    useEffect(() => {
        if (!plan || plan.seasons.length === 0) {
            setReviewSeasonId(null)
            return
        }
        setReviewSeasonId((current) => {
            if (current && plan.seasons.some((s) => s._id === current)) return current
            return (
                plan.seasons.find((s) => s.startMonth <= thisMonth && s.endMonth >= thisMonth)?._id ??
                plan.seasons[plan.seasons.length - 1]._id
            )
        })
    }, [plan, thisMonth])

    /**
     * Build the selected season's scorecard.
     *
     * Only the records the season links are scored — an unlinked savings target
     * isn't this season's business — while the dated logs are fetched for its
     * window and filtered there.
     */
    const loadScorecard = useCallback(async () => {
        if (!plan || !reviewSeasonId) return
        const season = plan.seasons.find((s) => s._id === reviewSeasonId)
        if (!season) return
        const start = monthStartDate(season.startMonth)
        const end = monthEndDate(season.endMonth)
        setReviewLoading(true)
        setReviewError(null)
        try {
            const [fitnessEntries, mealEntries, workoutLogs, conditioningLogs, weightLogs, habits, habitLogs] =
                await Promise.all([
                    listFitnessEntries(start, end),
                    listMealEntries(start, end),
                    listWorkoutLogs(),
                    listConditioningLogs(),
                    listWeightLogs(start),
                    listHabits(),
                    listHabitLogs(start, end),
                ])
            setScorecard(
                buildScorecard({
                    season,
                    today: todayKey(),
                    fitnessEntries,
                    workoutLogs,
                    conditioningLogs,
                    mealEntries,
                    weightLogs,
                    habitLogs,
                    habitCount: habits.length,
                    savingsTargets: records.savingsTargets.filter((t) =>
                        season.links.savingsTargets.includes(t._id)
                    ),
                    nutritionPhases: records.nutritionPhases.filter((p) =>
                        season.links.nutritionPhases.includes(p._id)
                    ),
                })
            )
        } catch (err) {
            setReviewError(errorMessage(err, 'Could not score this season.'))
        } finally {
            setReviewLoading(false)
        }
    }, [plan, reviewSeasonId, records.savingsTargets, records.nutritionPhases])

    // Score lazily: the review pulls seven collections, so it waits for the tab.
    useEffect(() => {
        if (tab !== 'Review') return
        void loadScorecard()
    }, [tab, loadScorecard])

    // ─── Plan actions ─────────────────────────────────────────────────────────

    async function savePlan(input: LifePlanInput) {
        setPlanSaving(true)
        setPlanError(null)
        try {
            if (editingPlan) {
                const updated = await lifePlans.updateLifePlan(editingPlan._id, input)
                setPlans((ps) => ps.map((p) => (p._id === updated._id ? updated : p)))
            } else {
                const created = await lifePlans.createLifePlan(input)
                setPlans((ps) => [...ps, created])
                setPlanId(created._id)
            }
            setPlanFormOpen(false)
        } catch (err) {
            setPlanError(errorMessage(err, 'Could not save the plan.'))
        } finally {
            setPlanSaving(false)
        }
    }

    async function confirmDeletePlan() {
        if (!deletingPlan) return
        try {
            await lifePlans.deleteLifePlan(deletingPlan._id)
            const remaining = plans.filter((p) => p._id !== deletingPlan._id)
            setPlans(remaining)
            if (planId === deletingPlan._id) {
                setPlanId(activePlan(remaining, thisMonth)?._id ?? null)
            }
        } catch (err) {
            setError(errorMessage(err, 'Could not delete the plan.'))
        } finally {
            setDeletingPlan(null)
        }
    }

    // ─── Season actions ───────────────────────────────────────────────────────

    async function saveSeason(input: SeasonInput) {
        if (!plan) return
        setSeasonSaving(true)
        setSeasonError(null)
        try {
            const updated = editingSeason
                ? await lifePlans.updateSeason(plan._id, editingSeason._id, input)
                : await lifePlans.createSeason(plan._id, input)
            setPlans((ps) => ps.map((p) => (p._id === updated._id ? updated : p)))
            setSeasonFormOpen(false)
        } catch (err) {
            setSeasonError(errorMessage(err, 'Could not save the season.'))
        } finally {
            setSeasonSaving(false)
        }
    }

    async function confirmDeleteSeason() {
        if (!plan || !deletingSeason) return
        try {
            const updated = await lifePlans.deleteSeason(plan._id, deletingSeason._id)
            setPlans((ps) => ps.map((p) => (p._id === updated._id ? updated : p)))
        } catch (err) {
            setSeasonError(errorMessage(err, 'Could not delete the season.'))
        } finally {
            setDeletingSeason(null)
        }
    }

    async function saveReview(review: SeasonReview) {
        if (!plan || !reviewSeasonId) return
        setReviewSaving(true)
        setReviewError(null)
        try {
            const updated = await lifePlans.saveSeasonReview(plan._id, reviewSeasonId, review)
            setPlans((ps) => ps.map((p) => (p._id === updated._id ? updated : p)))
        } catch (err) {
            setReviewError(errorMessage(err, 'Could not save the retro.'))
        } finally {
            setReviewSaving(false)
        }
    }


    if (loading) {
        return (
            <Container as="main" className="py-10">
                <div className="grid place-items-center py-24">
                    <Spinner size="lg" />
                </div>
            </Container>
        )
    }

    const planMonths = plan ? monthRange(plan.start, plan.end) : []
    const planMonthIndex = planMonths.indexOf(thisMonth)
    const nextSeason = plan?.seasons
        .filter((s) => s.startMonth > thisMonth)
        .sort((a, b) => a.startMonth.localeCompare(b.startMonth))[0]

    function openNewSeason(preset?: { startMonth: string; endMonth: string }) {
        setEditingSeason(null)
        setSeasonPreset(preset ?? null)
        setSeasonError(null)
        setSeasonFormOpen(true)
    }

    function openEditSeason(season: Season) {
        setEditingSeason(season)
        setSeasonPreset(null)
        setSeasonError(null)
        setSeasonFormOpen(true)
    }

    return (
        <main className="py-8 sm:py-10">
            <Container>
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                            Life plan
                        </h1>
                        <p className="mt-1 text-sm text-neutral-500">
                            {plan
                                ? `${plan.name} · ${formatMonthRange(plan.start, plan.end)}`
                                : 'The long view — what each stretch of time is for, and what it\u2019s carrying.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {plans.length > 1 && (
                            <Select
                                className="min-w-[10rem]"
                                options={plans.map((p) => ({
                                    value: p._id,
                                    label: `${p.name} · ${formatMonthRange(p.start, p.end)}`,
                                }))}
                                value={planId ?? undefined}
                                onChange={setPlanId}
                            />
                        )}
                        {plan && (
                            <DropdownMenu
                                align="right"
                                trigger={<MoreButton label="Plan options" />}
                                items={[
                                    {
                                        label: 'Edit plan',
                                        icon: 'fa-solid fa-pen',
                                        onClick: () => {
                                            setEditingPlan(plan)
                                            setPlanError(null)
                                            setPlanFormOpen(true)
                                        },
                                    },
                                    {
                                        label: 'New plan',
                                        icon: 'fa-solid fa-plus',
                                        onClick: () => {
                                            setEditingPlan(null)
                                            setPlanError(null)
                                            setPlanFormOpen(true)
                                        },
                                    },
                                    'divider',
                                    {
                                        label: 'Delete plan',
                                        icon: 'fa-solid fa-trash',
                                        danger: true,
                                        onClick: () => setDeletingPlan(plan),
                                    },
                                ]}
                            />
                        )}
                        {plan ? (
                            <Button icon="fa-solid fa-plus" onClick={() => openNewSeason()}>
                                New season
                            </Button>
                        ) : (
                            plans.length > 0 && (
                                <Button
                                    icon="fa-solid fa-plus"
                                    onClick={() => {
                                        setEditingPlan(null)
                                        setPlanError(null)
                                        setPlanFormOpen(true)
                                    }}
                                >
                                    New plan
                                </Button>
                            )
                        )}
                    </div>
                </header>

                {plan?.vision && (
                    <p className="mt-4 flex max-w-3xl gap-3 border-l-2 border-neutral-200 pl-4 text-[15px] leading-relaxed text-neutral-600">
                        {plan.vision}
                    </p>
                )}

                {error && (
                    <Alert variant="danger" className="mt-6">
                        {error}
                    </Alert>
                )}
            </Container>

            {!plan ? (
                <Container className="mt-10">
                    <EmptyState
                        icon="fa-compass"
                        title="No life plan yet"
                        description="Start with a horizon — usually a year — then break it into seasons."
                        action={
                            <Button
                                icon="fa-solid fa-plus"
                                onClick={() => {
                                    setEditingPlan(null)
                                    setPlanFormOpen(true)
                                }}
                            >
                                Create a plan
                            </Button>
                        }
                    />
                </Container>
            ) : (
                <>
                    <Container>
                        {/* Where you are right now, so the long view still opens on today. */}
                        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-[1.3fr_1.2fr_1fr]">
                            <div className={`${PANEL} flex min-w-0 flex-col p-5`}>
                                <div className="flex items-center justify-between gap-3">
                                    <p className={OVERLINE}>Now · {formatMonthKey(thisMonth)}</p>
                                    {currentSeason && (
                                        <span
                                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorClasses(currentSeason.color).dot}`}
                                            aria-hidden="true"
                                        />
                                    )}
                                </div>
                                {currentSeason ? (
                                    (() => {
                                        const { monthIndex, monthCount } = seasonProgress(currentSeason, thisMonth)
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => openEditSeason(currentSeason)}
                                                className="mt-2 flex flex-1 flex-col text-left"
                                            >
                                                <p className="truncate text-xl font-semibold tracking-[-0.015em] text-neutral-950">
                                                    {currentSeason.name}
                                                </p>
                                                {currentSeason.focus && (
                                                    <p className="mt-0.5 line-clamp-2 text-[13px] text-neutral-500">
                                                        {currentSeason.focus}
                                                    </p>
                                                )}
                                                <div className="mt-auto pt-4">
                                                    <div className="flex items-center justify-between text-[13px] text-neutral-500">
                                                        <span>
                                                            Month {monthIndex} of {monthCount}
                                                        </span>
                                                        <span className="tabular-nums">
                                                            {formatMonthRange(currentSeason.startMonth, currentSeason.endMonth)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 flex gap-1">
                                                        {Array.from({ length: monthCount }, (_, i) => (
                                                            <span
                                                                key={i}
                                                                className={`h-1.5 flex-1 rounded-full ${
                                                                    i < monthIndex
                                                                        ? colorClasses(currentSeason.color).dot
                                                                        : 'bg-neutral-200'
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </button>
                                        )
                                    })()
                                ) : (
                                    <div className="mt-2 flex flex-1 flex-col">
                                        <p className="text-xl font-semibold tracking-[-0.015em] text-neutral-400">
                                            No season this month
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => openNewSeason({ startMonth: thisMonth, endMonth: thisMonth })}
                                            className="mt-auto inline-flex items-center gap-1.5 pt-4 text-left text-sm font-medium text-neutral-900 hover:text-neutral-600"
                                        >
                                            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                                            Start one here
                                        </button>
                                    </div>
                                )}
                            </div>

                            {currentLoad ? (
                                <button
                                    type="button"
                                    onClick={() => setSelectedMonth(currentLoad.month)}
                                    className={`${PANEL} flex min-w-0 flex-col p-5 text-left transition-shadow hover:shadow-sm`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <p className={OVERLINE}>This month&apos;s load</p>
                                        <LoadPill
                                            level={currentLoad.level}
                                            detail={currentLoad.peak ? RESERVE_LABELS[currentLoad.peak] : undefined}
                                        />
                                    </div>
                                    <div className="mt-4 w-full">
                                        <ReserveMeter load={currentLoad} />
                                    </div>
                                </button>
                            ) : (
                                <div className={`${PANEL} p-5`}>
                                    <p className={OVERLINE}>This month&apos;s load</p>
                                    <p className="mt-2 text-sm text-neutral-500">Outside this plan&apos;s window.</p>
                                </div>
                            )}

                            <div className={`${PANEL} flex min-w-0 flex-col p-5 md:col-span-2 lg:col-span-1`}>
                                <p className={OVERLINE}>The plan</p>
                                <p className="mt-2 text-[28px] font-medium leading-none tracking-[-0.03em] tabular-nums text-neutral-950">
                                    {planMonthIndex >= 0 ? planMonthIndex + 1 : '—'}
                                    <span className="text-base font-normal tracking-normal text-neutral-400">
                                        {' '}
                                        / {planMonths.length} months
                                    </span>
                                </p>
                                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-neutral-200">
                                    <span
                                        className="block h-full rounded-full bg-neutral-900"
                                        style={{
                                            width: `${planMonths.length ? (Math.max(0, planMonthIndex + 1) / planMonths.length) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                                <div className="mt-auto space-y-1 pt-4 text-[13px] text-neutral-500">
                                    <p className="flex justify-between gap-3">
                                        <span>Seasons</span>
                                        <span className="tabular-nums text-neutral-900">{plan.seasons.length}</span>
                                    </p>
                                    <p className="flex justify-between gap-3">
                                        <span>Up next</span>
                                        <span className="min-w-0 truncate text-neutral-900">
                                            {nextSeason
                                                ? `${nextSeason.name} · ${formatMonthKey(nextSeason.startMonth).slice(0, 3)}`
                                                : '—'}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <Tabs
                            tabs={[...TABS]}
                            value={tab}
                            onChange={(t) => setTab(t as Tab)}
                            className="mt-8"
                        />
                    </Container>

                    {tab === 'Timeline' ? (
                        <Container fluid className="mt-6 max-w-[1600px]">
                            {timeline && (
                                <>
                                    {/* The grid needs width to be readable at all — hence the
                                        full-bleed container; narrow screens get the
                                        month-by-month read instead. */}
                                    <div className="hidden lg:block">
                                        <LifePlanTimeline
                                            timeline={timeline}
                                            loads={loads}
                                            onSelectItem={setSelectedItem}
                                            onSelectMonth={setSelectedMonth}
                                            onSelectSeason={(id) => {
                                                const season = plan.seasons.find((s) => s._id === id)
                                                if (season) openEditSeason(season)
                                            }}
                                        />
                                    </div>
                                    <div className="lg:hidden">
                                        <TimelineMonthList
                                            timeline={timeline}
                                            loads={loads}
                                            onSelectItem={setSelectedItem}
                                            onSelectMonth={setSelectedMonth}
                                        />
                                    </div>
                                    <p className="mx-auto mt-4 max-w-3xl text-center text-[13px] text-neutral-500">
                                        Everything here is owned by its own module — tap a bar to open it there.
                                        Tap a load cell for that month&apos;s breakdown.
                                    </p>
                                </>
                            )}
                        </Container>
                    ) : (
                        <Container className="mt-6">
                            {tab === 'Seasons' && (
                                <SeasonsTab
                                    plan={plan}
                                    loads={loads}
                                    onNew={openNewSeason}
                                    onEdit={openEditSeason}
                                    onDelete={setDeletingSeason}
                                />
                            )}

                            {tab === 'Pressure' && (
                                <PressureCheck
                                    plan={plan}
                                    loads={loads}
                                    input={loadInput}
                                    capacities={capacities}
                                    onSelectMonth={setSelectedMonth}
                                />
                            )}

                            {tab === 'Review' && (
                                <SeasonReviewTab
                                    plan={plan}
                                    seasonId={reviewSeasonId}
                                    onSelectSeason={setReviewSeasonId}
                                    scorecard={scorecard}
                                    loading={reviewLoading}
                                    saving={reviewSaving}
                                    error={reviewError}
                                    onSave={saveReview}
                                />
                            )}
                        </Container>
                    )}
                </>
            )}

            {plan && (
                <MonthLoadDrawer
                    plan={plan}
                    load={loads.find((l) => l.month === selectedMonth) ?? null}
                    onClose={() => setSelectedMonth(null)}
                />
            )}

            <LaneItemDrawer
                item={selectedItem}
                records={records}
                onClose={() => setSelectedItem(null)}
            />

            <PlanForm
                open={planFormOpen}
                plan={editingPlan}
                saving={planSaving}
                error={planError}
                onSave={savePlan}
                onClose={() => setPlanFormOpen(false)}
            />

            {plan && (
                <SeasonForm
                    open={seasonFormOpen}
                    plan={plan}
                    season={editingSeason}
                    preset={seasonPreset}
                    records={records}
                    saving={seasonSaving}
                    error={seasonError}
                    onSave={saveSeason}
                    onClose={() => setSeasonFormOpen(false)}
                />
            )}

            <ConfirmModal
                open={!!deletingPlan}
                title="Delete plan"
                message={
                    <>
                        Delete <strong>{deletingPlan?.name}</strong> and all its seasons? The records
                        it links to aren&apos;t touched.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDeletePlan}
                onClose={() => setDeletingPlan(null)}
            />

            <ConfirmModal
                open={!!deletingSeason}
                title="Delete season"
                message={
                    <>
                        Delete <strong>{deletingSeason?.name}</strong>? Its months go back to being
                        unclaimed; nothing it links to is affected.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDeleteSeason}
                onClose={() => setDeletingSeason(null)}
            />
        </main>
    )
}
