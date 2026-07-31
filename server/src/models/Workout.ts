import { Schema, model, Document, Types } from 'mongoose'

/** One exercise slot in a workout: a library exercise plus its prescribed volume. */
export interface IWorkoutExercise {
    exercise: Types.ObjectId
    /** Number of working sets, if prescribed. */
    sets?: number
    /** Reps per set — free-form to allow ranges/AMRAP, e.g. "8-12". */
    reps?: string
}

export interface IWorkout extends Document {
    user: Types.ObjectId
    name: string
    description: string
    /** Pin this workout to the top of the week planner. */
    showInPlanner: boolean
    /** Ordered exercises drawn from the library, each with optional sets/reps. */
    exercises: IWorkoutExercise[]
    /** Priority position in the library (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const workoutExerciseSchema = new Schema<IWorkoutExercise>(
    {
        exercise: { type: Schema.Types.ObjectId, ref: 'Exercise', required: true },
        sets: { type: Number, min: 0 },
        reps: { type: String, trim: true },
    },
    { _id: false }
)

const workoutSchema = new Schema<IWorkout>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        showInPlanner: { type: Boolean, default: false },
        exercises: { type: [workoutExerciseSchema], default: [] },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

workoutSchema.index({ user: 1, order: 1 })

export default model<IWorkout>('Workout', workoutSchema)
