import { Schema, model, Document, Types } from 'mongoose'

export const GOAL_STATUSES = ['active', 'completed', 'abandoned'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const PROGRESS_MODES = ['manual', 'auto'] as const
export type ProgressMode = (typeof PROGRESS_MODES)[number]

export interface IMilestone {
    _id: Types.ObjectId
    title: string
    completed: boolean
    order: number
}

export interface IGoal extends Document {
    user: Types.ObjectId
    title: string
    description?: string
    targetDate?: string
    progress: number // 0–100
    status: GoalStatus
    milestones: IMilestone[]
    /** How `progress` is determined: 'manual' (slider) or 'auto' (derived from linked habits). */
    progressMode: ProgressMode
    /** Habits whose completion rate drives progress when progressMode is 'auto'. */
    linkedHabits: Types.ObjectId[]
    /** Window start (YYYY-MM-DD) for the consistency calculation. Defaults to the goal's creation date. */
    startDate?: string
    createdAt: Date
    updatedAt: Date
}

const milestoneSchema = new Schema<IMilestone>(
    {
        title: { type: String, required: true, trim: true },
        completed: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
    },
    { _id: true }
)

const goalSchema = new Schema<IGoal>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        targetDate: { type: String },
        progress: { type: Number, default: 0, min: 0, max: 100 },
        status: { type: String, enum: GOAL_STATUSES, default: 'active' },
        milestones: { type: [milestoneSchema], default: [] },
        progressMode: { type: String, enum: PROGRESS_MODES, default: 'manual' },
        linkedHabits: { type: [{ type: Schema.Types.ObjectId, ref: 'HabitDef' }], default: [] },
        startDate: { type: String },
    },
    { timestamps: true }
)

export default model<IGoal>('Goal', goalSchema)
