import { Schema, model, Document, Types } from 'mongoose'
import type { Phased } from '../lib/phases'

export const CONDITIONING_CATEGORIES = [
    'HIIT',
    'Cardio',
    'Endurance',
    'Mobility',
    'Recovery',
] as const
export type ConditioningCategory = (typeof CONDITIONING_CATEGORIES)[number]

/** One step within a phase, e.g. "Walk 5 min" or "6 x 90s jog". */
export interface ISessionPart {
    name: string
    detail?: string
    /** If set, this part is an interval block to tick off — the number of rounds to complete. */
    rounds?: number
    /** What one round is called, e.g. "round", "interval", "rep". Defaults to "round". */
    roundLabel?: string
    /** Optional per-round info shown under each rep on the counter. */
    roundDetails?: string[]
    /** Optional duration (seconds) of each rep — enables clock timestamps on the counter. */
    roundSeconds?: number[]
    /** Optional clock offset (seconds) when the first rep begins, e.g. after a warm-up. */
    startAtSec?: number
    /** Planned slot, in minutes from the start of the session (e.g. 15 → 30). */
    startMin?: number
    endMin?: number
}

/** A session's parts sit in three ordered phases: warmUp, main, coolDown (Phased). */
export interface IConditioningSession extends Document, Phased<ISessionPart> {
    user: Types.ObjectId
    name: string
    /** Planned duration in minutes. */
    duration: number
    category: ConditioningCategory
    /** What the session is for, e.g. "Build aerobic base". */
    purpose?: string
    /** Guidance on how / when to run the session. */
    howToUse?: string
    /** Setup to lay out before starting, one line each — e.g. where the cones go. */
    helpers: string[]
    /** Priority position in the library (lower = sooner). */
    order: number
    /** Import batch id if this record came from a bulk import (for undo). */
    importBatch?: string | null
    createdAt: Date
    updatedAt: Date
}

const partSchema = new Schema<ISessionPart>(
    {
        name: { type: String, required: true, trim: true },
        detail: { type: String, trim: true },
        rounds: { type: Number, min: 1 },
        roundLabel: { type: String, trim: true },
        roundDetails: { type: [String], default: undefined },
        roundSeconds: { type: [Number], default: undefined },
        startAtSec: { type: Number, min: 0 },
        startMin: { type: Number, min: 0 },
        endMin: { type: Number, min: 0 },
    },
    { _id: false }
)

const conditioningSessionSchema = new Schema<IConditioningSession>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        duration: { type: Number, default: 0, min: 0 },
        category: { type: String, enum: CONDITIONING_CATEGORIES, default: 'HIIT' },
        purpose: { type: String, trim: true },
        warmUp: { type: [partSchema], default: [] },
        main: { type: [partSchema], default: [] },
        coolDown: { type: [partSchema], default: [] },
        howToUse: { type: String, trim: true },
        helpers: { type: [String], default: [] },
        order: { type: Number, default: 0 },
        importBatch: { type: String, default: null },
    },
    { timestamps: true }
)

conditioningSessionSchema.index({ user: 1, order: 1 })
conditioningSessionSchema.index({ user: 1, importBatch: 1 })

export default model<IConditioningSession>('ConditioningSession', conditioningSessionSchema)
