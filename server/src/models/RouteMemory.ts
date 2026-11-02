import { Schema, model, Document, Types } from 'mongoose'

/**
 * What route generation remembers per user, kept apart from the routes
 * themselves so deleting a route doesn't let it come back:
 * - `home`: the saved start point. Server-side only — never put in a link.
 * - `sessions`: per conditioning session, the seed keys already sent and the
 *   fingerprints of routes already shown, so "Generate another" is always new.
 * - `bad`: fingerprints of reported routes and where they started, so nothing
 *   like them is offered again in that area.
 */
export interface IRouteMemory extends Document {
    user: Types.ObjectId
    home: { lat: number; lng: number } | null
    sessions: { session: Types.ObjectId; keys: string[]; seen: string[][] }[]
    bad: { lat: number; lng: number; cells: string[] }[]
    /** Last generate press, for the cooldown. */
    lastPressAt: Date | null
}

const routeMemorySchema = new Schema<IRouteMemory>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    home: {
        type: new Schema({ lat: Number, lng: Number }, { _id: false }),
        default: null,
    },
    sessions: {
        type: [
            new Schema(
                {
                    session: { type: Schema.Types.ObjectId, ref: 'ConditioningSession' },
                    keys: { type: [String], default: [] },
                    seen: { type: [[String]], default: [] },
                },
                { _id: false }
            ),
        ],
        default: [],
    },
    bad: {
        type: [new Schema({ lat: Number, lng: Number, cells: [String] }, { _id: false })],
        default: [],
    },
    lastPressAt: { type: Date, default: null },
})

export default model<IRouteMemory>('RouteMemory', routeMemorySchema)
