import { Schema, model, Document, Types, Query } from 'mongoose'

export const FITNESS_PLAN_KINDS = ['workout', 'conditioning'] as const
export type FitnessPlanKind = (typeof FITNESS_PLAN_KINDS)[number]

/** Which slot of the day a planned item sits in. */
/**
 * Where a planned conditioning session stands on Garmin: the workout it was sent
 * as, its placement on the Garmin calendar, the day that placement is for (the
 * entry may have moved since) and a hash of the steps that were sent.
 */
export interface IPlanEntryGarmin {
    workoutId: string
    scheduleId: string
    scheduledDate: string
    stepsHash: string
    lastSentAt: Date
}

export const FITNESS_PLAN_PARTS = ['morning', 'afternoon', 'evening'] as const
export type FitnessPlanPart = (typeof FITNESS_PLAN_PARTS)[number]

/**
 * A single training item placed on one day of the weekly planner — a strength
 * workout or a conditioning session. Only the ref matching
 * `kind` is set; the others stay null. Details (exercises, duration…) are read
 * from the referenced document at display time, so library edits flow through
 * to the plan. `part` places the item in the morning/afternoon/evening slot.
 */
export interface IFitnessPlanEntry extends Document {
    user: Types.ObjectId
    /** The day this sits on, "YYYY-MM-DD". */
    date: string
    /** Which slot of the day it sits in. */
    part: FitnessPlanPart
    /** Which library the planned item comes from. */
    kind: FitnessPlanKind
    workout: Types.ObjectId | null
    session: Types.ObjectId | null
    /**
     * The training plan that placed this entry, when it came from applying one.
     * Lets a plan be un-applied without touching hand-placed entries.
     */
    plan: Types.ObjectId | null
    /** Position within the day+part (lower = sooner). */
    order: number
    /**
     * When true the planner's clash warning is suppressed for this entry — the
     * calendar collision has been seen and accepted, so it stops being flagged.
     * Set per entry rather than per event: the same event may be a real problem
     * for one session and beside the point for another.
     */
    ignoreClash: boolean
    /**
     * When true the planner's overload warning is suppressed for this entry — the
     * doubled-up slot has been seen and accepted. Set on every hard session in the
     * slot, so a session moved in later brings the warning back with it.
     */
    ignoreOverload: boolean
    /**
     * When true the session was deliberately skipped — it stays on the plan,
     * marked with a no-entry sign, rather than being deleted or left looking
     * missed. `skipReason` is the optional note on why.
     */
    skipped: boolean
    skipReason: string
    /** Set once the session has been sent to Garmin. */
    garmin?: IPlanEntryGarmin | null
    createdAt: Date
    updatedAt: Date
}

const fitnessPlanEntrySchema = new Schema<IFitnessPlanEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        part: { type: String, enum: FITNESS_PLAN_PARTS, default: 'morning' },
        kind: { type: String, enum: FITNESS_PLAN_KINDS, required: true },
        workout: { type: Schema.Types.ObjectId, ref: 'Workout', default: null },
        session: { type: Schema.Types.ObjectId, ref: 'ConditioningSession', default: null },
        plan: { type: Schema.Types.ObjectId, ref: 'TrainingPlan', default: null },
        order: { type: Number, default: 0 },
        ignoreClash: { type: Boolean, default: false },
        ignoreOverload: { type: Boolean, default: false },
        skipped: { type: Boolean, default: false },
        skipReason: { type: String, default: '', trim: true, maxlength: 280 },
        garmin: {
            type: new Schema<IPlanEntryGarmin>(
                {
                    workoutId: { type: String, required: true },
                    scheduleId: { type: String, required: true },
                    scheduledDate: { type: String, required: true },
                    stepsHash: { type: String, required: true },
                    lastSentAt: { type: Date, required: true },
                },
                { _id: false }
            ),
            default: null,
        },
    },
    { timestamps: true }
)

/** An entry that was on the Garmin calendar when it was deleted. */
export interface DeletedGarminEntry {
    user: string
    scheduleId: string
}

let onGarminEntriesDeleted: ((entries: DeletedGarminEntry[]) => void) | null = null

/**
 * Called after entries that were sent to Garmin are deleted, however they were
 * deleted — one entry, a cleared week, an un-applied plan — so their Garmin
 * calendar placements can be taken off too. Set by the Garmin module at boot;
 * kept as a callback so this model doesn't import it.
 */
export function setGarminDeleteListener(fn: (entries: DeletedGarminEntry[]) => void) {
    onGarminEntriesDeleted = fn
}

type DeleteQuery = Query<unknown, IFitnessPlanEntry> & { _garminDeleted?: DeletedGarminEntry[] }

async function noteGarminEntries(this: DeleteQuery) {
    if (!onGarminEntriesDeleted) return
    const docs = await this.model
        .find({ ...this.getFilter(), 'garmin.scheduleId': { $exists: true } })
        .select('user garmin.scheduleId')
        .lean<{ user: Types.ObjectId; garmin?: { scheduleId: string } | null }[]>()
    this._garminDeleted = docs.flatMap((d) =>
        d.garmin?.scheduleId ? [{ user: String(d.user), scheduleId: d.garmin.scheduleId }] : []
    )
}

function releaseGarminEntries(this: DeleteQuery) {
    if (this._garminDeleted?.length) onGarminEntriesDeleted?.(this._garminDeleted)
}

for (const op of ['deleteMany', 'deleteOne', 'findOneAndDelete'] as const) {
    fitnessPlanEntrySchema.pre(op, { document: false, query: true }, noteGarminEntries)
    fitnessPlanEntrySchema.post(op, { document: false, query: true }, releaseGarminEntries)
}

fitnessPlanEntrySchema.index({ user: 1, date: 1 })
fitnessPlanEntrySchema.index({ user: 1, plan: 1 })

export default model<IFitnessPlanEntry>('FitnessPlanEntry', fitnessPlanEntrySchema)
