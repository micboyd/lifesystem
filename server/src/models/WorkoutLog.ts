import { Schema, model, Document, Types } from 'mongoose'

/** One performed set inside a logged exercise: weight lifted (kg) and reps done. */
export interface ILoggedSet {
    weight?: number
    reps?: number
}

/** A snapshotted exercise line inside a logged workout. */
export interface IWorkoutLogExercise {
    name: string
    sets?: number
    reps?: string
    /** The sets actually performed, with per-set weight and reps. */
    loggedSets?: ILoggedSet[]
}

/**
 * A record that a strength workout was completed. The name and exercise lines are
 * snapshotted from the library workout at log time, so the record survives the
 * library workout being edited or deleted.
 */
export interface IWorkoutLog extends Document {
    user: Types.ObjectId
    /** Library workout this came from, if any. Null once that workout is deleted. */
    workout: Types.ObjectId | null
    name: string
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Snapshot of the workout's exercises (names + prescribed volume) at log time. */
    exercises: IWorkoutLogExercise[]
    /** Actual minutes spent, if recorded. */
    durationMin?: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const loggedSetSchema = new Schema<ILoggedSet>(
    {
        weight: { type: Number, min: 0 },
        reps: { type: Number, min: 0 },
    },
    { _id: false }
)

const workoutLogExerciseSchema = new Schema<IWorkoutLogExercise>(
    {
        name: { type: String, required: true, trim: true },
        sets: { type: Number, min: 0 },
        reps: { type: String, trim: true },
        loggedSets: { type: [loggedSetSchema], default: undefined },
    },
    { _id: false }
)

const workoutLogSchema = new Schema<IWorkoutLog>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        workout: { type: Schema.Types.ObjectId, ref: 'Workout', default: null },
        name: { type: String, required: true, trim: true },
        date: { type: String, required: true },
        exercises: { type: [workoutLogExerciseSchema], default: [] },
        durationMin: { type: Number, min: 0 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

workoutLogSchema.index({ user: 1, date: -1 })

export default model<IWorkoutLog>('WorkoutLog', workoutLogSchema)
