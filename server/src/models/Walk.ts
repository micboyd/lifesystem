import { Schema, model, Document, Types } from 'mongoose'
import { ISO_DATE_PATTERN } from './DailyEnergy'

export const WALK_PACES = ['relaxed', 'steady', 'brisk'] as const
export type WalkPace = (typeof WALK_PACES)[number]

export const WALK_GOALS = ['time', 'steps', 'calories', 'distance'] as const
export type WalkGoalKind = (typeof WALK_GOALS)[number]

export interface WalkPoint {
    lat: number
    lng: number
    label: string
}

export interface WalkRoute {
    /** [lng, lat, ele] — GeoJSON order, as openrouteservice sends it. */
    coords: number[][]
    distanceM: number
    ascentM: number
    descentM: number
}

/**
 * A planned walk on a day: when, how far (one target, in the unit it was set
 * in — minutes, steps, kcal or km), from where and past what. The route is
 * optional and belongs to the walk; `doneAt` is set when it's ticked off.
 */
export interface IWalk extends Document {
    user: Types.ObjectId
    /** YYYY-MM-DD */
    date: string
    /** HH:MM */
    time: string
    name: string
    pace: WalkPace
    goal: { kind: WalkGoalKind; value: number }
    start: WalkPoint
    stops: WalkPoint[]
    /** Null: back to the start. */
    end: WalkPoint | null
    route: WalkRoute | null
    doneAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const pointSchema = new Schema<WalkPoint>(
    {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        label: { type: String, default: '' },
    },
    { _id: false }
)

const routeSchema = new Schema<WalkRoute>(
    {
        coords: { type: [[Number]], required: true },
        distanceM: { type: Number, required: true, min: 0 },
        ascentM: { type: Number, default: 0 },
        descentM: { type: Number, default: 0 },
    },
    { _id: false }
)

const walkSchema = new Schema<IWalk>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        name: { type: String, default: '', trim: true },
        pace: { type: String, enum: WALK_PACES, default: 'steady' },
        goal: {
            kind: { type: String, enum: WALK_GOALS, required: true },
            value: { type: Number, required: true, min: 0 },
        },
        start: { type: pointSchema, required: true },
        stops: { type: [pointSchema], default: [] },
        end: { type: pointSchema, default: null },
        route: { type: routeSchema, default: null },
        doneAt: { type: Date, default: null },
    },
    { timestamps: true }
)

walkSchema.index({ user: 1, date: 1, time: 1 })

export default model<IWalk>('Walk', walkSchema)
