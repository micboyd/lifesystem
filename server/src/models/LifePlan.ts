import { Schema, model, Document, Types } from 'mongoose'
import { CALENDAR_COLORS, type CalendarColor } from './Calendar'
import { MONTH_PATTERN } from './MonthNote'

/**
 * The domains a life plan tracks. These are the app's real modules, not
 * abstract life areas — each pillar is a lane on the timeline that reads from
 * something already recorded elsewhere.
 */
export const LIFE_PILLARS = ['training', 'nutrition', 'money', 'study', 'life'] as const
export type LifePillar = (typeof LIFE_PILLARS)[number]

/** What a season is trying to do in one pillar, in the user's own words. */
export interface ISeasonIntent {
    pillar: LifePillar
    text: string
}

/**
 * What a season pulls in from the rest of the app. These are references only —
 * the linked documents stay owned and edited by their own modules, and the
 * timeline reads their dates at display time. Nothing here is duplicated, so a
 * training plan that moves moves on the timeline too.
 */
export interface ISeasonLinks {
    trainingPlans: Types.ObjectId[]
    nutritionPhases: Types.ObjectId[]
    savingsTargets: Types.ObjectId[]
    goals: Types.ObjectId[]
    courses: Types.ObjectId[]
    monthNotes: Types.ObjectId[]
}

/** A season's retro, written once it has elapsed. Scores are 0–100. */
export interface ISeasonReview {
    /** "YYYY-MM-DD" the review was written. */
    reviewedAt?: string
    /** Free-text retro — what actually happened. */
    notes?: string
    /** How it went overall, 1–5. Set by hand; the scored pillars are derived. */
    rating?: number
}

/**
 * One chapter of a life plan: a dated stretch of months with a focus and a
 * stated intent per pillar. The season is the unit that matters — everything
 * above it is framing, everything below it (the week) already exists.
 */
export interface ISeason {
    _id: Types.ObjectId
    name: string
    /** Inclusive "YYYY-MM" bounds. A one-month season has start === end. */
    startMonth: string
    endMonth: string
    /** The season in a sentence. */
    focus?: string
    color: CalendarColor
    intent: ISeasonIntent[]
    links: ISeasonLinks
    review?: ISeasonReview
    order: number
}

export interface ILifePlan extends Document {
    user: Types.ObjectId
    name: string
    /** Inclusive "YYYY-MM" bounds of the whole plan. */
    start: string
    end: string
    /** The multi-year theme this plan serves — the horizon above the year. */
    vision?: string
    /** Which lanes this plan tracks, in display order. */
    pillars: LifePillar[]
    seasons: Types.DocumentArray<ISeason>
    /** Library position (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const intentSchema = new Schema<ISeasonIntent>(
    {
        pillar: { type: String, enum: LIFE_PILLARS, required: true },
        text: { type: String, required: true, trim: true, maxlength: 500 },
    },
    { _id: false }
)

const linksSchema = new Schema<ISeasonLinks>(
    {
        trainingPlans: { type: [{ type: Schema.Types.ObjectId, ref: 'TrainingPlan' }], default: [] },
        nutritionPhases: {
            type: [{ type: Schema.Types.ObjectId, ref: 'NutritionPhase' }],
            default: [],
        },
        savingsTargets: { type: [{ type: Schema.Types.ObjectId, ref: 'SavingsTarget' }], default: [] },
        goals: { type: [{ type: Schema.Types.ObjectId, ref: 'Goal' }], default: [] },
        courses: { type: [{ type: Schema.Types.ObjectId, ref: 'Course' }], default: [] },
        monthNotes: { type: [{ type: Schema.Types.ObjectId, ref: 'MonthNote' }], default: [] },
    },
    { _id: false }
)

const reviewSchema = new Schema<ISeasonReview>(
    {
        reviewedAt: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
        notes: { type: String, trim: true },
        rating: { type: Number, min: 1, max: 5 },
    },
    { _id: false }
)

const seasonSchema = new Schema<ISeason>(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        startMonth: { type: String, required: true, match: MONTH_PATTERN },
        endMonth: { type: String, required: true, match: MONTH_PATTERN },
        focus: { type: String, trim: true, maxlength: 300 },
        color: { type: String, enum: CALENDAR_COLORS, default: 'neutral' },
        intent: { type: [intentSchema], default: [] },
        links: { type: linksSchema, default: () => ({}) },
        review: { type: reviewSchema, default: undefined },
        order: { type: Number, default: 0 },
    },
    { _id: true }
)

const lifePlanSchema = new Schema<ILifePlan>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        start: { type: String, required: true, match: MONTH_PATTERN },
        end: { type: String, required: true, match: MONTH_PATTERN },
        vision: { type: String, trim: true },
        pillars: { type: [{ type: String, enum: LIFE_PILLARS }], default: [...LIFE_PILLARS] },
        seasons: { type: [seasonSchema], default: [] },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

lifePlanSchema.index({ user: 1, order: 1 })
lifePlanSchema.index({ user: 1, start: 1 })

export default model<ILifePlan>('LifePlan', lifePlanSchema)
