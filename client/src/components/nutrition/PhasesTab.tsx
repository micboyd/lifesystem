import { useEffect, useRef, useState } from 'react'
import Spinner from '../Spinner'
import Alert from '../Alert'
import ConfirmModal from '../ConfirmModal'
import PhaseLibrary from './PhaseLibrary'
import PhaseExportDrawer from './PhaseExportDrawer'
import BasicPlanDrawer from './BasicPlanDrawer'
import JsonImportPanel from '../JsonImportPanel'
import PillToggle from '../PillToggle'
import type { NutritionPhase } from '../../types'
import * as phaseService from '../../services/nutritionPhases'
import { createMeal } from '../../services/meals'
import MissingMealsPanel, { missingMealsOf, type NewMealDraft } from './MissingMealsPanel'
import { useToast } from '../../context/ToastContext'

/** The message an API error carries, or a fallback. */
function errorMessage(err: unknown, fallback: string): string {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    return message ?? fallback
}

/**
 * Plans tab: the one place nutrition plans (NutritionPhase in the data) are created, edited and deleted.
 *
 * Other screens (Timeline, Stats, the planner) only read them — the same
 * arrangement as training plans in Fitness.
 */
const mealsOff = (n: number) => `${n} meal${n === 1 ? '' : 's'}`

export default function PhasesTab({
    openPhaseId,
    onOpened,
    onMealsChanged,
}: {
    /** Meals were added to the Library (from an import), so its list is stale. */
    onMealsChanged?: () => void
    /** A phase to open for editing on arrival — set when coming from the Timeline page. */
    openPhaseId?: string | null
    onOpened?: () => void
}) {
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<NutritionPhase | null>(null)
    const [deletingAll, setDeletingAll] = useState(false)
    const [importing, setImporting] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [basic, setBasic] = useState(false)
    // The importer: basic plans (dates + targets) or the full format with a meal week.
    const [importMode, setImportMode] = useState<'basic' | 'advanced'>('basic')
    const toast = useToast()
    // Set for one retry when the user chose to import without missing meals.
    const skipMissing = useRef(false)

    async function addMeals(drafts: NewMealDraft[]) {
        try {
            for (const d of drafts)
                await createMeal({
                    name: d.name,
                    types: d.types,
                    macros: { calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat },
                    notes: 'Added from a plan import',
                })
            onMealsChanged?.()
            toast.show(`Added ${drafts.length} meal${drafts.length === 1 ? '' : 's'} to your Library`, 'success')
        } catch {
            toast.show('Could not add the meals to your Library.')
            throw new Error('meals not added')
        }
    }

    function reload() {
        return phaseService
            .listNutritionPhases()
            .then(setPhases)
            .catch((err) => setLoadError(errorMessage(err, 'Could not load your plans.')))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        void reload()
    }, [])

    async function confirmDelete() {
        if (!deleting) return
        try {
            const removed = await phaseService.deleteNutritionPhase(deleting._id)
            setPhases((prev) => prev.filter((p) => p._id !== deleting._id))
            if (removed > 0) toast.show(`Plan deleted — ${mealsOff(removed)} off the planner`, 'success')
        } catch (err) {
            setError(errorMessage(err, 'Could not delete the plan.'))
        } finally {
            setDeleting(null)
        }
    }

    async function confirmDeleteAll() {
        try {
            const removed = await phaseService.deleteAllNutritionPhases()
            setPhases([])
            if (removed > 0) toast.show(`Plans deleted — ${mealsOff(removed)} off the planner`, 'success')
        } catch (err) {
            setError(errorMessage(err, 'Could not delete the plans.'))
            void reload()
        } finally {
            setDeletingAll(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Spinner size="lg" />
            </div>
        )
    }
    if (loadError) return <Alert variant="danger">{loadError}</Alert>

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import plans"
                description={
                    importMode === 'basic'
                        ? 'Paste one or many basic plans — dates, direction and daily targets. Nothing goes on the planner.'
                        : 'Paste one or many plans — dates, direction and daily targets, a goal if you want the adaptive review to steer towards it, and a meal week to put on the planner.'
                }
                toolbar={
                    <PillToggle
                        label="Kind of plan to import"
                        options={[
                            { value: 'basic', label: 'Basic plan' },
                            { value: 'advanced', label: 'Advanced plan' },
                        ]}
                        value={importMode}
                        onChange={setImportMode}
                    />
                }
                template={importMode === 'basic' ? BASIC_TEMPLATE : PHASE_TEMPLATE}
                notes={importMode === 'basic' ? <BasicImportNotes /> : <PhaseImportNotes />}
                itemNoun="plan"
                onBack={() => setImporting(false)}
                doImport={(data, overwrite) => {
                    const skip = skipMissing.current
                    skipMissing.current = false
                    return phaseService.importNutritionPhases(importMode === 'basic' ? basicOnly(data) : data, overwrite, skip)
                }}
                renderError={(err, retry, dismiss) => {
                    const missing = missingMealsOf(err)
                    if (!missing) return null
                    return (
                        <MissingMealsPanel
                            key={missing.map((m) => m.name).join('|')}
                            missing={missing}
                            onAdd={async (drafts) => {
                                await addMeals(drafts)
                                // Meals left unticked are imported without.
                                if (drafts.length < missing.length) skipMissing.current = true
                                retry()
                            }}
                            onSkip={() => {
                                skipMissing.current = true
                                retry()
                            }}
                            onCancel={dismiss}
                        />
                    )
                }}
                resource="nutrition-phases"
                existingItems={phases}
                onLibraryChanged={() => void reload()}
                onImported={async () => {
                    await reload()
                    setImporting(false)
                }}
            />
        )
    }

    return (
        <>
            {error && (
                <div className="mb-4">
                    <Alert variant="danger">{error}</Alert>
                </div>
            )}
            <PhaseLibrary
                phases={phases}
                onDelete={setDeleting}
                onDeleteAll={() => setDeletingAll(true)}
                onImport={() => setImporting(true)}
                onBasic={() => setBasic(true)}
                onExport={() => setExporting(true)}
                // Only handed over once phases have loaded, so the request can't be
                // consumed against an empty list and silently dropped.
                openPhaseId={openPhaseId}
                onOpened={onOpened}
            />
            <BasicPlanDrawer
                open={basic}
                onClose={() => setBasic(false)}
                onCreated={(plan) => setPhases((prev) => [...prev, plan])}
            />
            <PhaseExportDrawer
                open={exporting}
                phases={phases}
                onClose={() => setExporting(false)}
            />
            <ConfirmModal
                open={!!deleting}
                title="Delete plan"
                message={
                    <>
                        Delete <strong>{deleting?.name}</strong>? The meals it put on your planner come off too —
                        anything already eaten or skipped stays. This can’t be undone.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDelete}
                onClose={() => setDeleting(null)}
            />
            <ConfirmModal
                open={deletingAll}
                title="Delete all plans?"
                message={
                    <>
                        Delete all{' '}
                        <strong>
                            {phases.length} plan{phases.length !== 1 ? 's' : ''}
                        </strong>
                        ? The meals they put on your planner come off too — anything already eaten or skipped
                        stays. This can’t be undone.
                    </>
                }
                confirmLabel="Delete all"
                danger
                onConfirm={confirmDeleteAll}
                onClose={() => setDeletingAll(false)}
            />
        </>
    )
}

// ─── Import ─────────────────────────────────────────────────────────────────────

/** What a basic plan keeps. Anything else in the paste (menu, putOnPlanner, goal…) is dropped. */
const BASIC_KEYS = ['name', 'startDate', 'endDate', 'kind', 'targets', 'weeklyRate', 'notes'] as const

function basicPlan(plan: unknown): unknown {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan
    const src = plan as Record<string, unknown>
    return Object.fromEntries(BASIC_KEYS.filter((k) => k in src).map((k) => [k, src[k]]))
}

/** A paste reduced to basic plans: a list, `{ plans: [...] }`, or one plan. */
function basicOnly(data: unknown): unknown {
    if (Array.isArray(data)) return data.map(basicPlan)
    if (data && typeof data === 'object' && Array.isArray((data as { plans?: unknown }).plans))
        return { ...(data as object), plans: (data as { plans: unknown[] }).plans.map(basicPlan) }
    return basicPlan(data)
}

/** The basic import format: dates and targets, no meal week. */
const BASIC_TEMPLATE = `[
  // One object per plan. "name", "startDate" and "endDate" are required.
  {
    "name": "Winter cut",
    "startDate": "2026-11-30",                      // YYYY-MM-DD, inclusive
    "endDate": "2027-02-28",
    "kind": "cut",                                  // cut | maintain | gain (default maintain)
    "targets": { "calories": 2400, "protein": 200, "carbs": 220, "fat": 70 },
    "weeklyRate": -0.5,                             // optional, kg/week
    "notes": "Two batch cooks a week"               // optional
  }
]
`

function BasicImportNotes() {
    const f = (s: string) => <span className="font-semibold text-neutral-700">{s}</span>
    return (
        <>
            <p>
                {f('name')}, {f('startDate')} and {f('endDate')} are required; dates are YYYY-MM-DD and inclusive.{' '}
                {f('kind')} is {f('cut')}, {f('maintain')} or {f('gain')} — maintain if left out.
            </p>
            <p>
                {f('targets')} are the daily {f('calories')}, {f('protein')}, {f('carbs')} and {f('fat')} the planner
                shows for each day, and adds up for the week. Leave any out for no target on that one.
            </p>
            <p>
                A basic plan only guides — no meals go on the planner. Anything else in the paste ({f('menu')},{' '}
                {f('putOnPlanner')}, {f('goal')}…) is ignored; switch to Advanced plan for those.
            </p>
        </>
    )
}

/** The phase import format, annotated. Comments are ignored on import. */
const PHASE_TEMPLATE = `[
  // One object per plan. "name", "startDate" and "endDate" are required.
  {
    "name": "Winter cut",
    "startDate": "2026-11-02",                      // YYYY-MM-DD, inclusive
    "endDate": "2027-01-31",
    "kind": "cut",                                  // cut | maintain | gain (default maintain)
    "targets": { "calories": 2100, "protein": 180, "carbs": 200, "fat": 65 },
    "weeklyRate": -0.5,                             // kg/week, negative for a cut
    "goalMode": "weight-loss",                      // weight-loss | recomposition | maintenance | weight-gain
    "notes": "Diet break over Christmas week",     // optional

    // Optional: what the plan is aiming at. Turns on progress + the adaptive review.
    "goal": {
      "startWeightKg": 86,
      "startBodyFatPct": 20,
      "targetDate": "2027-01-31",
      "targetWeightKg": 80,
      "targetWeightRangeKg": { "min": 79, "max": 81 },   // optional: counts as arriving
      "targetBodyFatPct": 15,
      "targetBodyFatRangePct": { "min": 14, "max": 16 },
      "targetWeeklyRateKg": -0.5,
      "acceptableWeeklyRateKg": { "min": -0.7, "max": -0.3 },
      "proteinFloorG": 170,
      "adaptive": true
    },

    // Optional: how the adaptive review works. The numbers are the defaults.
    "adaptive": {
      "enabled": true,                              // wins over goal.adaptive; off if neither is set
      "reviewWindowDays": 21,                       // days of history each review reads
      "minimumDataDays": 14,                        // fewer logged days: no figures quoted
      "preferredDataDays": 21,                      // fewer logged days: no change proposed
      "minAdjustmentKcal": 100,                     // smaller changes aren't proposed
      "maxAdjustmentKcal": 150,                     // biggest change at one review
      "calorieAdherenceToleranceKcal": 150,         // a day this close to target counts as on plan
      "minCoverage": 0.7                            // share of the window that must be logged, 0–1
    },

    // Optional: which macros may move when calories change.
    // fixed | minimum | remainder | adjustable
    "macroPolicy": { "protein": "minimum", "fat": "fixed", "carbs": "remainder" },

    // Optional: calorie cycling by training load — "activity", or "flat" (the
    // same as leaving it out). hardKcal is added on hard days, restKcal taken off rest days.
    "strategy": { "type": "activity", "hardKcal": 200, "restKcal": 150 },

    // Optional: the meal week, repeated for the whole plan. Meals go by their
    // Library name; a list puts several in one slot. Days are mon–sun, or
    // weekdays / weekend / everyDay — a named day overrides those. Slots are
    // breakfast, lunch, dinner (or tea / supper) and snack.
    "menu": {
      "everyDay": { "breakfast": "Overnight oats", "snack": "Rice cakes" },
      "weekdays": { "lunch": "Chicken stroganoff", "dinner": "BBQ chicken & beans" },
      "sat": { "lunch": "Teriyaki & ginger", "dinner": ["Coconut curry chicken", "Naan"] },
      "sun": { "lunch": "Chicken stroganoff", "dinner": "Chicken cacciatore" }
    },

    // Optional: macros for meals the menu names that your Library doesn't have
    // yet. They pre-fill the "add them to your Library?" step. types are the
    // slots the meal suits; a meal already in the Library is left as it is.
    "meals": [
      { "name": "Chicken sausages", "types": ["breakfast"], "calories": 220, "protein": 24, "carbs": 4, "fat": 12 }
    ],

    // Optional: put the meal week on the planner — true (from today, or the
    // plan's start) or a later date to start from. Slots that already have
    // something keep it. Breakfast, lunch and dinner slots your calendar has an
    // event over are left out — no need to list them — and snacks too on days
    // when events (back to back or all day) cover all three.
    "putOnPlanner": true
  },
  {
    "name": "Spring maintenance",
    "startDate": "2027-02-01",
    "endDate": "2027-03-14",
    "kind": "maintain",
    "targets": { "calories": 2600, "protein": 170 }
  }
]
`

function PhaseImportNotes() {
    const f = (s: string) => <span className="font-semibold text-neutral-700">{s}</span>
    return (
        <>
            <p>
                {f('name')}, {f('startDate')} and {f('endDate')} are required; dates are YYYY-MM-DD and
                inclusive. {f('kind')} is {f('cut')}, {f('maintain')} or {f('gain')} — maintain if left out.
            </p>
            <p>
                {f('targets')} are the daily {f('calories')}, {f('protein')}, {f('carbs')} and {f('fat')}. Leave
                any out for no target on that one.
            </p>
            <p>
                Paste a list of plans, or an object with them under {f('plans')}.
            </p>
            <p>
                {f('weeklyRate')} and the rates inside {f('goal')} are kg per week, signed: negative for a cut,
                positive for a gain. In {f('acceptableWeeklyRateKg')}, min is the smaller number.
            </p>
            <p>
                {f('targetWeightRangeKg')} and {f('targetBodyFatRangePct')} are the band around each target that
                counts as arriving. {f('adaptive')} tunes the review; leave it out for the defaults shown. Its{' '}
                {f('enabled')} turns the review on or off and wins over the older {f('goal.adaptive')}; with
                neither set, the review is off.
            </p>
            <p>
                {f('goal')}, {f('adaptive')}, {f('macroPolicy')}, {f('strategy')} and {f('notes')} are all optional — a plan
                without them works exactly like one made by hand with the extras left blank.
            </p>
            <p>
                {f('menu')} is the meal week. Slots are {f('breakfast')}, {f('lunch')}, {f('dinner')} and{' '}
                {f('snack')}; each takes a meal name or a list of names, matched to your Library ignoring case. A
                name that matches nothing stops the import and says which. Updating a plan without a {f('menu')}{' '}
                keeps its week; {f('"menu": null')} empties it. The menu can also be a list of{' '}
                {f('{ "day": "mon", "slot": "lunch", "meal": "…" }')}, the shape an export writes.
            </p>
            <p>
                {f('meals')} gives the {f('calories')}, {f('protein')}, {f('carbs')}, {f('fat')} and{' '}
                {f('types')} of meals the menu names that aren&apos;t in your Library yet. The import still stops to
                ask before adding them, with those numbers already filled in. Meals your Library has are left alone.
            </p>
            <p>
                {f('putOnPlanner')} copies the week onto every day from today (or the date given) to the plan&apos;s
                end. Meals you planned, ate or marked away yourself stay. Where a calendar event covers breakfast
                (morning), lunch (afternoon) or dinner (evening) — or the whole day — the slot gets an away note named
                after the event instead of a meal. Snacks go on unless events — one all-day event, or several back to
                back — cover breakfast, lunch and dinner. Events set to ignore planner clashes don&apos;t count. Undoing the import takes the plan&apos;s uneaten meals and away notes back off.
            </p>
            <p>
                Every plan is checked before any are saved, so one mistake won&apos;t leave a half import. A
                plan with the same name as one you have lets you choose to update it or keep both.
            </p>
        </>
    )
}
