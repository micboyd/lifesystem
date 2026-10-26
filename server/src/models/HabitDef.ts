import { Schema, model, Document, Types } from 'mongoose'

/** When in the day a habit is done. Absent means any time. */
export const HABIT_PARTS = ['morning', 'afternoon', 'evening'] as const
export type HabitPart = (typeof HABIT_PARTS)[number]

export interface IHabitDef extends Document {
    user: Types.ObjectId
    name: string
    description?: string
    /** Font Awesome class for the tile icon, e.g. "fa-solid fa-dumbbell". */
    icon?: string
    /** When in the day it's done, so it sits there on the dashboard. Absent: any time. */
    part?: HabitPart
    order: number
    active: boolean
    createdAt: Date
    updatedAt: Date
}

const habitDefSchema = new Schema<IHabitDef>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        icon: { type: String, trim: true },
        part: { type: String, enum: HABIT_PARTS },
        order: { type: Number, default: 0 },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
)

habitDefSchema.index({ user: 1, order: 1 })

export default model<IHabitDef>('HabitDef', habitDefSchema)
