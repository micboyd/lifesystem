import { Schema, model, Document, Types } from 'mongoose'

/**
 * The Garmin workout made for a conditioning session. One per session, however
 * many days it's planned on: each day is a schedule of this one workout, which
 * keeps the Garmin library and the watch's workout list small. A changed
 * session updates the workout in place, so every scheduled day follows.
 */
export interface IGarminWorkout extends Document {
    user: Types.ObjectId
    session: Types.ObjectId
    workoutId: string
    /** Hash of the name + steps last uploaded (lib/watchSteps.ts). */
    stepsHash: string
    createdAt: Date
    updatedAt: Date
}

const garminWorkoutSchema = new Schema<IGarminWorkout>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        session: { type: Schema.Types.ObjectId, ref: 'ConditioningSession', required: true },
        workoutId: { type: String, required: true },
        stepsHash: { type: String, required: true },
    },
    { timestamps: true }
)

garminWorkoutSchema.index({ user: 1, session: 1 }, { unique: true })

export default model<IGarminWorkout>('GarminWorkout', garminWorkoutSchema)
