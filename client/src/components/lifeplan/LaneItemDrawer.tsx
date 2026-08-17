import { Link } from 'react-router-dom'
import Drawer from '../Drawer'
import Badge from '../Badge'
import Progress from '../Progress'
import { formatDateLong, formatMonthRange } from '../../lib/calendar'
import { LANE_SOURCE_ROUTES, type LaneItem, type LaneSource } from '../../lib/lifeTimeline'
import {
    NUTRITION_PHASE_LABELS,
    type Course,
    type Goal,
    type MonthNote,
    type NutritionPhase,
    type SavingsTarget,
    type TrainingPlan,
} from '../../types'

/**
 * The read-only detail for one thing on the timeline.
 *
 * Life Plan links records rather than owning them, so this drawer explains what a
 * bar is and then hands you off to the module that can actually change it. It
 * never edits anything itself — the alternative is two places that can write the
 * same record and disagree about it.
 */

const SOURCE_LABELS: Record<LaneSource, string> = {
    trainingPlan: 'Training plan',
    nutritionPhase: 'Nutrition phase',
    savingsTarget: 'Savings target',
    course: 'Study',
    monthNote: 'Month flag',
    goal: 'Goal',
}

const SOURCE_LINK_LABELS: Record<LaneSource, string> = {
    trainingPlan: 'Open in Fitness',
    nutritionPhase: 'Edit in Nutrition phases',
    savingsTarget: 'Open in Forecast',
    course: 'Open in Studying',
    monthNote: 'Open in Calendar',
    goal: 'Open in Goals',
}

/** A labelled row of detail. */
function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5">
            <span className="text-xs font-semibold text-neutral-400">{label}</span>
            <span className="text-right text-sm font-semibold tabular-nums text-neutral-900">
                {value}
            </span>
        </div>
    )
}

export interface LaneItemRecords {
    trainingPlans?: TrainingPlan[]
    nutritionPhases?: NutritionPhase[]
    savingsTargets?: SavingsTarget[]
    courses?: Course[]
    monthNotes?: MonthNote[]
    goals?: Goal[]
}

export default function LaneItemDrawer({
    item,
    records,
    onClose,
}: {
    item: LaneItem | null
    records: LaneItemRecords
    onClose: () => void
}) {
    const source = item?.source

    return (
        <Drawer
            open={!!item}
            onClose={onClose}
            title={item?.label}
            badge={source ? SOURCE_LABELS[source] : undefined}
            size="lg"
            footer={
                item && (
                    <Link
                        to={LANE_SOURCE_ROUTES[item.source]}
                        className="flex items-center justify-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
                    >
                        {SOURCE_LINK_LABELS[item.source]}
                        <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                    </Link>
                )
            }
        >
            {item && (
                <div className="space-y-5">
                    <div className="divide-y divide-neutral-100">
                        <Row
                            label="On the timeline"
                            value={formatMonthRange(item.startMonth, item.endMonth)}
                        />
                        {item.detail && <Row label="Summary" value={item.detail} />}
                    </div>

                    {(item.clippedStart || item.clippedEnd) && (
                        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                            This runs past the plan&apos;s window, so the bar is cut at the{' '}
                            {item.clippedStart && item.clippedEnd
                                ? 'start and end'
                                : item.clippedStart
                                  ? 'start'
                                  : 'end'}
                            .
                        </p>
                    )}

                    {source === 'trainingPlan' && <TrainingPlanDetail item={item} records={records} />}
                    {source === 'nutritionPhase' && <PhaseDetail item={item} records={records} />}
                    {source === 'savingsTarget' && <SavingsDetail item={item} records={records} />}
                    {source === 'course' && <CourseDetail item={item} records={records} />}
                    {source === 'monthNote' && <FlagDetail item={item} records={records} />}
                    {source === 'goal' && <GoalDetail item={item} records={records} />}
                </div>
            )}
        </Drawer>
    )
}

function TrainingPlanDetail({ item, records }: { item: LaneItem; records: LaneItemRecords }) {
    const plan = records.trainingPlans?.find((p) => p._id === item.recordId)
    if (!plan) return null
    return (
        <>
            <div className="divide-y divide-neutral-100">
                <Row label="Runs" value={`${formatDateLong(plan.planStart)} → ${formatDateLong(plan.planEnd)}`} />
                {plan.appliedAt && <Row label="Applied" value={`${plan.appliedEntries} entries on the planner`} />}
            </div>
            {plan.phases.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Phases
                    </h4>
                    {/* A phase's dates are free text in the source document, so they
                        can't be placed on the grid — they're listed as written. */}
                    <ul className="mt-2 space-y-2">
                        {plan.phases.map((phase, i) => (
                            <li key={`${phase.name}-${i}`} className="rounded-xl bg-neutral-50 px-3 py-2">
                                <p className="text-sm font-bold text-neutral-900">{phase.name}</p>
                                {phase.dates && (
                                    <p className="text-xs text-neutral-500">{phase.dates}</p>
                                )}
                                {phase.focus && (
                                    <p className="mt-1 text-xs text-neutral-600">{phase.focus}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    )
}

function PhaseDetail({ item, records }: { item: LaneItem; records: LaneItemRecords }) {
    const phase = records.nutritionPhases?.find((p) => p._id === item.recordId)
    if (!phase) return null
    const { calories, protein, carbs, fat } = phase.targets
    return (
        <>
            <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{NUTRITION_PHASE_LABELS[phase.kind]}</Badge>
                {typeof phase.weeklyRate === 'number' && phase.weeklyRate !== 0 && (
                    <Badge variant="outline">
                        {phase.weeklyRate > 0 ? '+' : ''}
                        {phase.weeklyRate} kg/week
                    </Badge>
                )}
            </div>
            <div className="divide-y divide-neutral-100">
                <Row label="Runs" value={`${formatDateLong(phase.startDate)} → ${formatDateLong(phase.endDate)}`} />
                {calories ? <Row label="Calories" value={`${calories} kcal`} /> : null}
                {protein ? <Row label="Protein" value={`${protein} g`} /> : null}
                {carbs ? <Row label="Carbs" value={`${carbs} g`} /> : null}
                {fat ? <Row label="Fat" value={`${fat} g`} /> : null}
            </div>
            {phase.notes && <p className="text-sm text-neutral-600">{phase.notes}</p>}
        </>
    )
}

function SavingsDetail({ item, records }: { item: LaneItem; records: LaneItemRecords }) {
    const target = records.savingsTargets?.find((t) => t._id === item.recordId)
    if (!target) return null
    return (
        <>
            <div className="flex flex-wrap gap-2">
                <Badge variant={target.onTrack ? 'success' : 'warning'}>
                    {target.onTrack ? 'On track' : 'Behind'}
                </Badge>
            </div>
            <div className="divide-y divide-neutral-100">
                <Row label="Target" value={`£${target.targetAmount.toLocaleString()}`} />
                <Row label="Per month" value={`£${Math.round(target.requiredMonthly).toLocaleString()}`} />
                <Row label="Window" value={formatMonthRange(target.startMonth, target.targetMonth)} />
            </div>
            {target.notes && <p className="text-sm text-neutral-600">{target.notes}</p>}
        </>
    )
}

function CourseDetail({ item, records }: { item: LaneItem; records: LaneItemRecords }) {
    const course = records.courses?.find((c) => c._id === item.recordId)
    if (!course) return null
    const pct =
        course.requiredHours > 0
            ? Math.min(100, Math.round((course.completedHours / course.requiredHours) * 100))
            : 0
    return (
        <>
            <div className="divide-y divide-neutral-100">
                {course.targetDate && <Row label="Deadline" value={formatDateLong(course.targetDate)} />}
                <Row label="Hours" value={`${course.completedHours} of ${course.requiredHours}`} />
            </div>
            <Progress value={pct} showLabel />
            {course.notes && <p className="text-sm text-neutral-600">{course.notes}</p>}
        </>
    )
}

function FlagDetail({ item, records }: { item: LaneItem; records: LaneItemRecords }) {
    const note = records.monthNotes?.find((n) => n._id === item.recordId)
    if (!note?.note) return null
    return <p className="text-sm text-neutral-600">{note.note}</p>
}

function GoalDetail({ item, records }: { item: LaneItem; records: LaneItemRecords }) {
    const goal = records.goals?.find((g) => g._id === item.recordId)
    if (!goal) return null
    const done = goal.milestones.filter((m) => m.completed).length
    return (
        <>
            <div className="divide-y divide-neutral-100">
                {goal.targetDate && <Row label="Target date" value={formatDateLong(goal.targetDate)} />}
                {goal.milestones.length > 0 && (
                    <Row label="Milestones" value={`${done} of ${goal.milestones.length} done`} />
                )}
            </div>
            <Progress value={goal.progress} showLabel />
            {goal.description && <p className="text-sm text-neutral-600">{goal.description}</p>}
        </>
    )
}
