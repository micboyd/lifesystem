import { Schema, model, Document, Types } from 'mongoose'
import {
    FITNESS_PLAN_KINDS,
    FITNESS_PLAN_PARTS,
    FitnessPlanKind,
    FitnessPlanPart,
} from './FitnessPlanEntry'

/**
 * Which part of a training plan an item plays. Kept alongside `kind` because two
 * items of the same kind can serve different roles — a run from the base plan and
 * a rugby conditioning session are both `conditioning`.
 */
export const PLAN_ROLES = ['strength', 'run', 'conditioning', 'mobility', 'recovery'] as const
export type PlanRole = (typeof PLAN_ROLES)[number]

/** A library item this plan links to. Details are read from the library at display time. */
export interface IPlanItem {
    kind: FitnessPlanKind
    role: PlanRole
    /** The library document — a Workout, ConditioningSession, Mobility or Recovery. */
    item: Types.ObjectId
    /** Name at import time, so the plan still reads sensibly if the item is deleted. */
    label: string
    /** True when the import created this item rather than matching an existing one. */
    created: boolean
}

/**
 * One materialised placement: a library item on a specific day + slot. The whole
 * schedule is computed once at import (weekday templates expanded across the plan
 * window, dated run sessions resolved), so applying a plan is a plain insert.
 */
export interface IPlanScheduleEntry {
    /** "YYYY-MM-DD". */
    date: string
    part: FitnessPlanPart
    kind: FitnessPlanKind
    role: PlanRole
    item: Types.ObjectId
    /** Name at import time — what the schedule preview shows without a join. */
    label: string
    /** Guidance carried from the source calendar, e.g. "4-6 km easy". */
    notes?: string
}

/** One block of the plan's periodisation, e.g. "5K Build". */
export interface IPlanPhase {
    name: string
    dates?: string
    focus?: string
    conditioning?: string
    strength?: string
    recoveryPriority?: string
}

/** One row of the plan's week-at-a-glance table. */
export interface IPlanWeekDay {
    day: string
    strength?: string
    conditioning?: string
    mobility?: string
    recovery?: string
}

/** A name in the source document that matched nothing in the libraries. */
export interface IPlanWarning {
    /** Where the unresolved name came from, e.g. "post10KCalendar". */
    source: string
    message: string
}

export interface ITrainingPlan extends Document {
    user: Types.ObjectId
    name: string
    /** Where the plan came from, free text from the import. */
    source?: string
    /** "YYYY-MM-DD" the source document was generated. */
    generatedAt?: string
    /** "YYYY-MM-DD" bounds of the plan. */
    planStart: string
    planEnd: string
    /** The plan's goal block — free-form, rendered as-is. */
    goal?: unknown
    phases: IPlanPhase[]
    weeklyTemplate: IPlanWeekDay[]
    /** Progression rules — free-form, rendered as-is. */
    strengthProgression?: unknown
    /** How mobility / recovery are used across the week, keyed by weekday. */
    mobilityUse?: unknown
    recoveryUse?: unknown
    readinessRules: string[]
    /** Every library item the plan links to. */
    items: IPlanItem[]
    /** The day-by-day placements, sorted by date then slot. */
    schedule: IPlanScheduleEntry[]
    /** Names the import could not resolve — surfaced on the plan detail view. */
    warnings: IPlanWarning[]
    /** When the plan was last pushed onto the weekly planner. */
    appliedAt?: Date | null
    /** Priority position in the plan library (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const planItemSchema = new Schema<IPlanItem>(
    {
        kind: { type: String, enum: FITNESS_PLAN_KINDS, required: true },
        role: { type: String, enum: PLAN_ROLES, required: true },
        item: { type: Schema.Types.ObjectId, required: true },
        label: { type: String, required: true, trim: true },
        created: { type: Boolean, default: false },
    },
    { _id: false }
)

const scheduleEntrySchema = new Schema<IPlanScheduleEntry>(
    {
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        part: { type: String, enum: FITNESS_PLAN_PARTS, default: 'morning' },
        kind: { type: String, enum: FITNESS_PLAN_KINDS, required: true },
        role: { type: String, enum: PLAN_ROLES, required: true },
        item: { type: Schema.Types.ObjectId, required: true },
        label: { type: String, required: true, trim: true },
        notes: { type: String, trim: true },
    },
    { _id: false }
)

const phaseSchema = new Schema<IPlanPhase>(
    {
        name: { type: String, required: true, trim: true },
        dates: { type: String, trim: true },
        focus: { type: String, trim: true },
        conditioning: { type: String, trim: true },
        strength: { type: String, trim: true },
        recoveryPriority: { type: String, trim: true },
    },
    { _id: false }
)

const weekDaySchema = new Schema<IPlanWeekDay>(
    {
        day: { type: String, required: true, trim: true },
        strength: { type: String, trim: true },
        conditioning: { type: String, trim: true },
        mobility: { type: String, trim: true },
        recovery: { type: String, trim: true },
    },
    { _id: false }
)

const warningSchema = new Schema<IPlanWarning>(
    {
        source: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true },
    },
    { _id: false }
)

const trainingPlanSchema = new Schema<ITrainingPlan>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        source: { type: String, trim: true },
        generatedAt: { type: String, trim: true },
        planStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        planEnd: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        goal: { type: Schema.Types.Mixed },
        phases: { type: [phaseSchema], default: [] },
        weeklyTemplate: { type: [weekDaySchema], default: [] },
        strengthProgression: { type: Schema.Types.Mixed },
        mobilityUse: { type: Schema.Types.Mixed },
        recoveryUse: { type: Schema.Types.Mixed },
        readinessRules: { type: [String], default: [] },
        items: { type: [planItemSchema], default: [] },
        schedule: { type: [scheduleEntrySchema], default: [] },
        warnings: { type: [warningSchema], default: [] },
        appliedAt: { type: Date, default: null },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

trainingPlanSchema.index({ user: 1, order: 1 })

export default model<ITrainingPlan>('TrainingPlan', trainingPlanSchema)
