import { Schema, model, Document, Types } from 'mongoose'
import type {
    ActivityChart,
    ActivityLap,
    ActivitySummary,
    ActivityZone,
} from '../garmin/provider'
import type { WatchStep } from '../lib/watchSteps'

/** A planned watch step as it stood when the run was linked — repeats unrolled. */
export type PlannedStep = Exclude<WatchStep, { type: 'repeat' }>

/**
 * A finished Garmin activity pulled into the app and linked to the planned
 * conditioning entry it was the run for, and to that entry's conditioning log.
 * Everything shown is kept here, so the page never waits on Garmin once linked.
 *
 * Unlinking keeps the record with `dismissed` set, so the automatic match
 * doesn't put it straight back; linking it by hand clears that.
 */
export interface IGarminActivity extends Document {
    user: Types.ObjectId
    activityId: string
    /** The day it started, in the watch's local time. */
    date: string
    entry: Types.ObjectId | null
    log: Types.ObjectId | null
    /** How the link was made. */
    linkedBy: 'workout' | 'day' | 'manual' | null
    dismissed: boolean
    summary: ActivitySummary
    laps: ActivityLap[]
    zones: ActivityZone[]
    /** [lng, lat] pairs. */
    track: number[][]
    chart: ActivityChart
    /** The session's watch steps when it was linked, to set the laps against. */
    planned: PlannedStep[]
    createdAt: Date
    updatedAt: Date
}

const garminActivitySchema = new Schema<IGarminActivity>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        activityId: { type: String, required: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        entry: { type: Schema.Types.ObjectId, ref: 'FitnessPlanEntry', default: null },
        log: { type: Schema.Types.ObjectId, ref: 'ConditioningLog', default: null },
        linkedBy: { type: String, enum: ['workout', 'day', 'manual', null], default: null },
        dismissed: { type: Boolean, default: false },
        // Shapes are the worker's, already reduced and checked; stored as given.
        summary: { type: Schema.Types.Mixed, required: true },
        laps: { type: Schema.Types.Mixed, default: [] },
        zones: { type: Schema.Types.Mixed, default: [] },
        track: { type: Schema.Types.Mixed, default: [] },
        chart: { type: Schema.Types.Mixed, default: {} },
        planned: { type: Schema.Types.Mixed, default: [] },
    },
    { timestamps: true, minimize: false }
)

garminActivitySchema.index({ user: 1, activityId: 1 }, { unique: true })
garminActivitySchema.index({ user: 1, date: 1 })
garminActivitySchema.index({ user: 1, entry: 1 })

export default model<IGarminActivity>('GarminActivity', garminActivitySchema)
