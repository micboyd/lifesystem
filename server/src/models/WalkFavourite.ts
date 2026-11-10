import { Schema, model, Document, Types } from 'mongoose'
import { pointSchema, routeSchema, type WalkPoint, type WalkRoute } from './Walk'

/** A starred route: the line and the points it went through, to bring back on any walk from there. */
export interface IWalkFavourite extends Document {
    user: Types.ObjectId
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    route: WalkRoute
    createdAt: Date
}

const walkFavouriteSchema = new Schema<IWalkFavourite>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        start: { type: pointSchema, required: true },
        stops: { type: [pointSchema], default: [] },
        end: { type: pointSchema, default: null },
        route: { type: routeSchema, required: true },
    },
    { timestamps: true }
)

export default model<IWalkFavourite>('WalkFavourite', walkFavouriteSchema)
