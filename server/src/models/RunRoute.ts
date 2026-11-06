import { Schema, model, Document, Types } from 'mongoose'

export const ROUTE_KINDS = ['loop', 'outback'] as const
export type RunRouteKind = (typeof ROUTE_KINDS)[number]

/**
 * A generated outdoor route for a conditioning session. Every press of
 * "Generate route" saves one; a few are kept as history. `chosenFor` lists the
 * planned entries (calendar items) this is the chosen route for — generating
 * again never changes it, only choosing does.
 */
export interface IRunRoute extends Document {
    user: Types.ObjectId
    session: Types.ObjectId
    kind: RunRouteKind
    /** [lng, lat, ele] — GeoJSON order, as openrouteservice sends it. */
    coords: number[][]
    targetM: number
    distanceM: number
    ascentM: number
    descentM: number
    /** What was asked for: start uphill, downhill or either. */
    startPref: 'any' | 'uphill' | 'downhill'
    /** Net climb (+) or drop (−) over the opening stretch, in metres. */
    openingM: number
    seed: number
    points: number
    /** True when no candidate was within tolerance and this was the closest. */
    offTarget: boolean
    chosenFor: Types.ObjectId[]
    /** Reported as a bad route — kept so it can be shown as such, never offered again. */
    reported: boolean
    createdAt: Date
    updatedAt: Date
}

const runRouteSchema = new Schema<IRunRoute>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        session: { type: Schema.Types.ObjectId, ref: 'ConditioningSession', required: true },
        kind: { type: String, enum: ROUTE_KINDS, default: 'loop' },
        coords: { type: [[Number]], required: true },
        targetM: { type: Number, required: true, min: 0 },
        distanceM: { type: Number, required: true, min: 0 },
        ascentM: { type: Number, default: 0 },
        descentM: { type: Number, default: 0 },
        startPref: { type: String, enum: ['any', 'uphill', 'downhill'], default: 'any' },
        openingM: { type: Number, default: 0 },
        seed: { type: Number, required: true },
        points: { type: Number, default: 3 },
        offTarget: { type: Boolean, default: false },
        chosenFor: { type: [Schema.Types.ObjectId], ref: 'FitnessPlanEntry', default: [] },
        reported: { type: Boolean, default: false },
    },
    { timestamps: true }
)

runRouteSchema.index({ user: 1, session: 1, createdAt: -1 })
runRouteSchema.index({ user: 1, chosenFor: 1 })

export default model<IRunRoute>('RunRoute', runRouteSchema)
