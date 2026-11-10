import { Schema, model, Document, Types } from 'mongoose'
import { ISO_DATE_PATTERN } from './DailyEnergy'
import { WALK_GOALS, WALK_PACES, pointSchema, type WalkGoalKind, type WalkPace, type WalkPoint } from './Walk'

/**
 * A walk that repeats on chosen weekdays. It holds the plan, never a route:
 * each day becomes its own Walk with a blank route, ready for that day's one.
 * `skipped` is days deleted or moved away, so they aren't filled back in.
 */
export interface IWalkSeries extends Document {
    user: Types.ObjectId
    /** 0 Sunday – 6 Saturday */
    days: number[]
    /** YYYY-MM-DD — nothing before this. */
    startDate: string
    skipped: string[]
    time: string
    name: string
    pace: WalkPace
    goal: { kind: WalkGoalKind; value: number }
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
}

const walkSeriesSchema = new Schema<IWalkSeries>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        days: { type: [Number], required: true },
        startDate: { type: String, required: true, match: ISO_DATE_PATTERN },
        skipped: { type: [String], default: [] },
        time: { type: String, required: true },
        name: { type: String, default: '' },
        pace: { type: String, enum: WALK_PACES, default: 'steady' },
        goal: {
            kind: { type: String, enum: WALK_GOALS, required: true },
            value: { type: Number, required: true, min: 0 },
        },
        start: { type: pointSchema, required: true },
        stops: { type: [pointSchema], default: [] },
        end: { type: pointSchema, default: null },
    },
    { timestamps: true }
)

export default model<IWalkSeries>('WalkSeries', walkSeriesSchema)
