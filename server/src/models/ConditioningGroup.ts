import { Schema, model, Document, Types } from 'mongoose'

/**
 * A user's own label for conditioning sessions, e.g. "Running" or "Rugby".
 * Called a "category" in the UI; separate from the fixed session type
 * (HIIT, Cardio…). Each has a colour so it reads apart on the planner.
 */
export const CONDITIONING_GROUP_COLORS = [
    'sky',
    'emerald',
    'amber',
    'rose',
    'violet',
    'teal',
    'orange',
    'slate',
] as const
export type ConditioningGroupColor = (typeof CONDITIONING_GROUP_COLORS)[number]

/** At most this many per user. */
export const MAX_CONDITIONING_GROUPS = 5

export interface IConditioningGroup extends Document {
    user: Types.ObjectId
    name: string
    color: ConditioningGroupColor
    order: number
    createdAt: Date
    updatedAt: Date
}

const conditioningGroupSchema = new Schema<IConditioningGroup>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        color: { type: String, enum: CONDITIONING_GROUP_COLORS, default: 'sky' },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

export default model<IConditioningGroup>('ConditioningGroup', conditioningGroupSchema)
