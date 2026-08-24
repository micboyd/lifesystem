import { useCallback, useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import Tabs from '../components/Tabs'
import Button from '../components/Button'
import Select from '../components/Select'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import LifePlanTimeline from '../components/lifeplan/LifePlanTimeline'
import TimelineMonthList from '../components/lifeplan/TimelineMonthList'
import LaneItemDrawer from '../components/lifeplan/LaneItemDrawer'
import SeasonsTab from '../components/lifeplan/SeasonsTab'
import SeasonForm from '../components/lifeplan/SeasonForm'
import NutritionPhasesTab from '../components/lifeplan/NutritionPhasesTab'
import PressureCheck from '../components/lifeplan/PressureCheck'
import SeasonReviewTab from '../components/lifeplan/SeasonReviewTab'
import PlanForm from '../components/lifeplan/PlanForm'
import LoadPill from '../components/lifeplan/LoadPill'
import MonthLoadDrawer from '../components/lifeplan/MonthLoadDrawer'
import ReserveMeter from '../components/lifeplan/ReserveMeter'
import {
    LIFE_PILLAR_LABELS,
    type Course,
    type Goal,
    type LifePlan as LifePlanType,
    type LifePlanInput,
    type MonthNote,
    type NutritionPhase,
    type NutritionPhaseInput,
    type SavingsTarget,
    type Season,
    type SeasonInput,
    type SeasonReview,
    type TrainingPlan,
} from '../types'
import { formatMonthKey, formatMonthRange, monthKey, todayKey } from '../lib/calendar'
import { activePlan, buildTimeline, seasonForMonth, seasonProgress, type LaneItem } from '../lib/lifeTimeline'
import { RESERVE_LABELS, computeMonthLoads } from '../lib/lifeLoad'
import { useLoadCapacities } from '../components/lifeplan/useLoadCapacities'
import { buildScorecard, monthEndDate, monthStartDate, type SeasonScorecard } from '../lib/seasonReview'
import * as lifePlans from '../services/lifePlans'
import * as phaseService from '../services/nutritionPhases'
import { listPlans } from '../services/plans'
import { listSavingsTargets } from '../services/savingsTargets'
import { listCourses } from '../services/courses'
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

const TABS = ['Timeline', 'Seasons', 'Nutrition', 'Pressure', 'Review'] as const
type Tab = (typeof TABS)[number]

/** Everything the timeline and the pressure check read, none of it owned here. */
interface LinkedRecords {
    trainingPlans: TrainingPlan[]
    nutritionPhases: NutritionPhase[]
    savingsTargets: SavingsTarget[]
    courses: Course[]
    monthNotes: MonthNote[]
    goals: Goal[]
}

const EMPTY_RECORDS: LinkedRecords = {
    trainingPlans: [],
    nutritionPhases: [],
    savingsTargets: [],
    courses: [],
    monthNotes: [],
    goals: [],
}

/** The message an API error carries, or a fallback. */
function errorMessage(err: unknown, fallback: string): string {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    return message ?? fallback
}

export default function LifePlan() {
    const [tab, setTab] = useState<Tab>('Timeline')
    // A phase the timeline drawer asked to edit, handed to the Nutrition tab.
    const [editPhaseId, setEditPhaseId] = useState<string | null>(null)
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

    // Nutrition phases
    const [phaseSaving, setPhaseSaving] = useState(false)
    const [phaseError, setPhaseError] = useState<string | null>(null)
    const [deletingPhase, setDeletingPhase] = useState<NutritionPhase | null>(null)

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
        Promise.all([lifePlans.listLifePlans(), listPlans(), phaseService.listNutritionPhases(), listSavingsTargets(), listCourses(), listGoals()])
            .then(([loadedPlans, trainingPlans, nutritionPhases, savingsTargets, courses, goals]) => {
                if (cancelled) return
                setPlans(loadedPlans)
                setPlanId((current) => current ?? activePlan(loadedPlans, thisMonth)?._id ?? null)
                setRecords((r) => ({ ...r, trainingPlans, nutritionPhases, savingsTargets, courses, goals }))
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
                    courses: records.courses.filter((c) => season.links.courses.includes(c._id)),
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
    }, [plan, reviewSeasonId, records.courses, records.savingsTargets, records.nutritionPhases])

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

    // ─── Nutrition phase actions ──────────────────────────────────────────────

    async function savePhase(input: NutritionPhaseInput, id?: string): Promise<boolean> {
        setPhaseSaving(true)
        setPhaseError(null)
        try {
            const saved = id
                ? await phaseService.updateNutritionPhase(id, input)
                : await phaseService.createNutritionPhase(input)
            setRecords((r) => ({
                ...r,
                nutritionPhases: id
                    ? r.nutritionPhases.map((p) => (p._id === saved._id ? saved : p))
                    : [...r.nutritionPhases, saved].sort((a, b) =>
                          a.startDate.localeCompare(b.startDate)
                      ),
            }))
            return true
        } catch (err) {
            setPhaseError(errorMessage(err, 'Could not save the phase.'))
            return false
        } finally {
            setPhaseSaving(false)
        }
    }

    async function confirmDeletePhase() {
        if (!deletingPhase) return
        try {
            await phaseService.deleteNutritionPhase(deletingPhase._id)
            setRecords((r) => ({
                ...r,
                nutritionPhases: r.nutritionPhases.filter((p) => p._id !== deletingPhase._id),
            }))
        } catch (err) {
            setPhaseError(errorMessage(err, 'Could not delete the phase.'))
        } finally {
            setDeletingPhase(null)
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

    return (
        <main className="py-8 sm:py-10">
            <Container>
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
                            Life plan
                        </h1>
                        <p className="mt-1 text-sm text-neutral-500">
                            The long view — what each stretch of time is for, and what it&apos;s carrying.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {plans.length > 0 && (
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
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingPlan(plan)
                                        setPlanError(null)
                                        setPlanFormOpen(true)
                                    }}
                                    aria-label="Edit plan"
                                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                >
                                    <i className="fa-solid fa-pen text-sm" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeletingPlan(plan)}
                                    aria-label="Delete plan"
                                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                >
                                    <i className="fa-solid fa-trash text-sm" aria-hidden="true" />
                                </button>
                            </>
                        )}
                        <Button
                            icon="fa-solid fa-plus"
                            size="sm"
                            onClick={() => {
                                setEditingPlan(null)
                                setPlanError(null)
                                setPlanFormOpen(true)
                            }}
                        >
                            New plan
                        </Button>
                    </div>
                </header>

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
                        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                    {formatMonthKey(thisMonth)}
                                </p>
                                {currentSeason ? (
                                    <p className="truncate text-sm font-bold text-neutral-950">
                                        {currentSeason.name}
                                        <span className="ml-2 font-semibold text-neutral-400">
                                            month {seasonProgress(currentSeason, thisMonth).monthIndex} of{' '}
                                            {seasonProgress(currentSeason, thisMonth).monthCount}
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-sm font-bold text-neutral-400">
                                        No season covers this month
                                    </p>
                                )}
                                {currentSeason?.focus && (
                                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                                        {currentSeason.focus}
                                    </p>
                                )}
                            </div>
                            {currentLoad && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedMonth(currentLoad.month)}
                                    className="w-full shrink-0 text-left sm:w-56"
                                >
                                    <div className="flex justify-end">
                                        <LoadPill
                                            level={currentLoad.level}
                                            detail={
                                                currentLoad.peak
                                                    ? RESERVE_LABELS[currentLoad.peak]
                                                    : undefined
                                            }
                                        />
                                    </div>
                                    <div className="mt-2.5">
                                        <ReserveMeter load={currentLoad} />
                                    </div>
                                </button>
                            )}
                        </div>

                        {plan.vision && (
                            <p className="mt-4 rounded-2xl bg-neutral-50 px-5 py-4 text-sm text-neutral-600">
                                {plan.vision}
                            </p>
                        )}

                        <Tabs
                            tabs={[...TABS]}
                            value={tab}
                            onChange={(t) => setTab(t as Tab)}
                            className="mt-6"
                        />
                    </Container>

                    {tab === 'Timeline' ? (
                        <Container fluid className="mt-6">
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
                                                if (!season) return
                                                setEditingSeason(season)
                                                setSeasonError(null)
                                                setSeasonFormOpen(true)
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
                                    <p className="mt-4 text-xs text-neutral-400">
                                        Bars and diamonds are read-only here — tap one to open it in the
                                        module that owns it. Lanes shown:{' '}
                                        {plan.pillars.map((p) => LIFE_PILLAR_LABELS[p]).join(', ')}.
                                        The Load row names the reserve each month is
                                        leaning on hardest — tap it for the full breakdown, or
                                        the Pressure tab for the whole window.
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
                                    onNew={() => {
                                        setEditingSeason(null)
                                        setSeasonError(null)
                                        setSeasonFormOpen(true)
                                    }}
                                    onEdit={(season) => {
                                        setEditingSeason(season)
                                        setSeasonError(null)
                                        setSeasonFormOpen(true)
                                    }}
                                    onDelete={setDeletingSeason}
                                />
                            )}

                            {tab === 'Nutrition' && (
                                <NutritionPhasesTab
                                    phases={records.nutritionPhases}
                                    saving={phaseSaving}
                                    error={phaseError}
                                    onSave={savePhase}
                                    onDelete={setDeletingPhase}
                                    openPhaseId={editPhaseId}
                                    onOpened={() => setEditPhaseId(null)}
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
                // Nutrition phases are edited on this page, so the drawer's
                // action has nowhere to navigate to — it switches tab and opens
                // the editor instead.
                onOpenHere={(item) => {
                    setSelectedItem(null)
                    if (item.source === 'nutritionPhase') {
                        setTab('Nutrition')
                        setEditPhaseId(item.recordId)
                    }
                }}
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

            <ConfirmModal
                open={!!deletingPhase}
                title="Delete phase"
                message={
                    <>
                        Delete <strong>{deletingPhase?.name}</strong>? Any season linking it will
                        simply stop showing it.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDeletePhase}
                onClose={() => setDeletingPhase(null)}
            />
        </main>
    )
}
