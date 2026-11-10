import { Schema, model, Document, Types } from 'mongoose'
import { WALK_GOALS, WALK_PACES, pointSchema, routeSchema, type WalkGoalKind, type WalkPace, type WalkPoint, type WalkRoute } from './Walk'

/**
 * A walk with no day: the plan and, if it has one, its route. Putting it on a
 * day copies it into a Walk, so a day can change without changing the plan.
 */
export interface IWalkLibraryItem extends Document {
    user: Types.ObjectId
    name: string
    pace: WalkPace
    goal: { kind: WalkGoalKind; value: number }
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    route: WalkRoute | null
    createdAt: Date
    updatedAt: Date
}

const walkLibraryItemSchema = new Schema<IWalkLibraryItem>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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
    },
    { timestamps: true }
)

export default model<IWalkLibraryItem>('WalkLibraryItem', walkLibraryItemSchema)
