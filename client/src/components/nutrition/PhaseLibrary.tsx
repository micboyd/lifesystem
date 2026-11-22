import { LibraryFilters } from '../LibraryToolbar'
import { useLibraryView } from '../../lib/librarySort'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../Button'
import Badge from '../Badge'
import EmptyState from '../EmptyState'
import { Card } from '../Card'
import DropdownMenu from '../DropdownMenu'
import LineIcon from '../LineIcon'
import {
    NUTRITION_PHASE_LABELS,
    type MacroGoals,
    type NutritionPhase,
    type NutritionPhaseKind,
} from '../../types'
import { formatDateShort, todayKey } from '../../lib/calendar'
import { byClosest } from '../../lib/phaseOrder'

/**
 * The phase library: dated stretches of eating with their own targets.
 *
 * Phases live in Nutrition because this module is what runs on them — Today reads
 * the live targets and appends dated adjustments, Progress and the planner judge
 * against them. Timeline only reads them for its projection.
 * Day-precise on purpose: a cut rarely starts on the 1st of a month.
 */

const KIND_VARIANTS: Record<NutritionPhaseKind, 'danger' | 'outline' | 'success'> = {
    cut: 'danger',
    maintain: 'outline',
    gain: 'success',
}

/** The macros a phase actually sets, for the summary line. */
function targetSummary(targets: MacroGoals): string {
    const bits: string[] = []
    if (targets.calories) bits.push(`${targets.calories} kcal`)
    if (targets.protein) bits.push(`${targets.protein}g P`)
    if (targets.carbs) bits.push(`${targets.carbs}g C`)
    if (targets.fat) bits.push(`${targets.fat}g F`)
    return bits.length > 0 ? bits.join(' · ') : 'No targets set'
}

export default function PhaseLibrary({
    phases,
    onDelete,
    onDeleteAll,
    onImport,
    onBasic,
    onExport,
    openPhaseId,
    onOpened,
}: {
    phases: NutritionPhase[]
    onDelete: (phase: NutritionPhase) => void
    /** Ask to delete every phase — behind the header's ⋯ menu. */
    onDeleteAll: () => void
    /** Switch to the paste-JSON importer. */
    onImport: () => void
    /** Open the basic plan drawer: dates and targets only, no meal week. */
    onBasic: () => void
    /** Open the exporter, where phases are ticked and exported as one set. */
    onExport: () => void
    /** A phase to open for editing on arrival — set when coming from the Timeline page. */
    openPhaseId?: string | null
    /** Called once that request has been honoured, so it fires only once. */
    onOpened?: () => void
}) {
    // Plans are made and edited in the full-screen builder.
    const navigate = useNavigate()
    const startNew = () => navigate('/nutrition/plans/new')
    const startEdit = (phase: NutritionPhase) => navigate(`/nutrition/plans/${phase._id}/edit`)

    // Arriving from the Timeline with a plan to edit: straight into the builder.
    useEffect(() => {
        if (!openPhaseId) return
        if (phases.some((p) => p._id === openPhaseId)) navigate(`/nutrition/plans/${openPhaseId}/edit`)
        onOpened?.()
    }, [openPhaseId, phases, onOpened, navigate])

    // Library order for plans is nearest-in-time first.
    const view = useLibraryView('nutritionPlans', byClosest(phases, todayKey()))

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-xl text-sm text-neutral-500">
                    A nutrition plan is a dated stretch of eating — a cut, a bulk or maintenance — with the
                    targets the planner and stats judge each day against.
                </p>
                {/* Export and Import go icon-only on phones so the row fits. */}
                <div className="flex flex-wrap gap-2">
                    {phases.length > 0 && (
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-file-export"
                            aria-label="Export"
                            onClick={onExport}
                        >
                            <span className="hidden sm:inline">Export</span>
                        </Button>
                    )}
                    <Button variant="secondary" icon="fa-solid fa-file-import" aria-label="Import" onClick={onImport}>
                        <span className="hidden sm:inline">Import</span>
                    </Button>
                    <Button variant="secondary" onClick={onBasic}>
                        Basic plan
                    </Button>
                    <Button icon="fa-solid fa-plus" onClick={startNew}>
                        New plan
                    </Button>
                    {phases.length > 0 && (
                        <DropdownMenu
                            align="right"
                            trigger={
                                <span
                                    aria-label="More plan options"
                                    className="grid h-11 w-11 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                    <LineIcon name="more" className="h-4 w-4" />
                                </span>
                            }
                            items={[
                                {
                                    label: 'Delete all plans',
                                    icon: 'fa-solid fa-trash-can',
                                    danger: true,
                                    onClick: onDeleteAll,
                                },
                            ]}
                        />
                    )}
                </div>
            </div>

            {phases.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-flag"
                    title="No plans yet"
                    description="A plan is a stretch of eating with its own calorie and protein targets."
                    action={
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button variant="secondary" onClick={onBasic}>
                                Basic plan
                            </Button>
                            <Button icon="fa-solid fa-plus" onClick={startNew}>
                                New plan
                            </Button>
                        </div>
                    }
                />
            ) : (
                <>
                {phases.length > 1 && (
                    <LibraryFilters
                        sort={view.sort}
                        onSort={view.onSort}
                        newCount={view.newCount}
                        newOnly={view.newOnly}
                        onNewOnly={view.onNewOnly}
                    />
                )}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {view.shown.map((phase) => (
                        <PhaseCard
                            key={phase._id}
                            phase={phase}
                            onOpen={() => startEdit(phase)}
                            onDelete={() => onDelete(phase)}
                        />
                    ))}
                </div>
                </>
            )}

        </div>
    )
}

// ─── Phase card ─────────────────────────────────────────────────────────────────

/** Where a phase sits relative to today, for the card's footer. */
function phaseStatus(phase: NutritionPhase, today: string): { label: string; tone: string } {
    const days = (a: string, b: string) =>
        Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
    if (today < phase.startDate) {
        const n = days(today, phase.startDate)
        return { label: `Starts in ${n} day${n === 1 ? '' : 's'}`, tone: 'text-neutral-500' }
    }
    if (today > phase.endDate) return { label: 'Finished', tone: 'text-neutral-500' }
    const left = days(today, phase.endDate)
    return {
        label: `Current · ${left} day${left === 1 ? '' : 's'} left`,
        tone: 'text-emerald-700 font-semibold',
    }
}

function PhaseCard({
    phase,
    onOpen,
    onDelete,
}: {
    phase: NutritionPhase
    onOpen: () => void
    onDelete: () => void
}) {
    const status = phaseStatus(phase, todayKey())
    const navigate = useNavigate()
    const menuPath = `/nutrition/plans/${phase._id}/menu`
    const menuCount = phase.menu?.length ?? 0
    return (
        <Card as="div" className="relative flex flex-col gap-3">
            <button
                type="button"
                aria-label={`Edit ${phase.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />

            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{phase.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                        {formatDateShort(phase.startDate)} → {formatDateShort(phase.endDate)}
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Plan actions"
                            className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onOpen },
                        { label: 'Meal week', icon: 'fa-solid fa-utensils', onClick: () => navigate(menuPath) },
                        {
                            label: 'Delete',
                            icon: 'fa-solid fa-trash-can',
                            danger: true,
                            onClick: onDelete,
                        },
                    ]}
                />
            </div>

            <div className="flex flex-wrap gap-1.5">
                <Badge variant={KIND_VARIANTS[phase.kind]}>
                    {NUTRITION_PHASE_LABELS[phase.kind]}
                </Badge>
                {typeof phase.weeklyRate === 'number' && phase.weeklyRate !== 0 && (
                    <Badge variant="outline">
                        {phase.weeklyRate > 0 ? '+' : ''}
                        {phase.weeklyRate} kg/wk
                    </Badge>
                )}
            </div>

            <p className="text-sm tabular-nums text-neutral-600">{targetSummary(phase.targets)}</p>
            {phase.notes && <p className="line-clamp-2 text-sm text-neutral-500">{phase.notes}</p>}

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                <span className={`text-xs ${status.tone}`}>{status.label}</span>
                <Link
                    to={menuPath}
                    className="relative z-20 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-900 hover:underline"
                >
                    {menuCount > 0 ? `Meal week · ${menuCount} meals` : 'Plan the meals'}
                    <i className="fa-solid fa-arrow-right text-[10px]" aria-hidden="true" />
                </Link>
            </div>
        </Card>
    )
}
