import { Schema, model, Document, Types } from 'mongoose'
import { MEAL_TYPES, MealType, IMacros, macrosSchema } from './Meal'

export const ENTRY_STATUSES = ['planned', 'eaten'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

/**
 * A meal on a day. Planned meals sit in the planner until ticked; `extra` marks
 * food logged through "Log more", which goes straight in as eaten.
 *
 * `name` and `macros` are copied from the library meal when it's added, so
 * editing or deleting a library meal never changes a day that's been eaten.
 * Editing a meal does update the copies on days still only planned.
 */
export interface IMealPlanEntry extends Document {
    user: Types.ObjectId
    /** "YYYY-MM-DD". */
    date: string
    slot: MealType
    meal?: Types.ObjectId
    name: string
    macros: IMacros
    status: EntryStatus
    extra: boolean
    order: number
    createdAt: Date
    updatedAt: Date
}

const mealPlanEntrySchema = new Schema<IMealPlanEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        slot: { type: String, enum: MEAL_TYPES, required: true },
        meal: { type: Schema.Types.ObjectId, ref: 'Meal' },
        name: { type: String, required: true, trim: true },
        macros: { type: macrosSchema, default: () => ({}) },
        status: { type: String, enum: ENTRY_STATUSES, default: 'planned' },
        extra: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mealPlanEntrySchema.index({ user: 1, date: 1 })

export default model<IMealPlanEntry>('MealPlanEntry', mealPlanEntrySchema)
