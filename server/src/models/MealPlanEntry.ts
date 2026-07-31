import { Schema, model, Document, Types } from 'mongoose'
import { MEAL_TYPES, MealType } from './Meal'

/**
 * A single meal placed into one slot of one day in the weekly planner.
 * Macros are not stored here — they are read from the referenced meal at
 * display time, so edits to a recipe flow through to every plan it sits in.
 */
export interface IMealPlanEntry extends Document {
    user: Types.ObjectId
    /** The day this sits on, "YYYY-MM-DD". */
    date: string
    /** Which slot of the day: breakfast / lunch / dinner / snack. */
    slot: MealType
    meal: Types.ObjectId
    /** Position within the day+slot (lower = sooner); mainly for snacks. */
    order: number
    createdAt: Date
    updatedAt: Date
}

const mealPlanEntrySchema = new Schema<IMealPlanEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        slot: { type: String, enum: MEAL_TYPES, required: true },
        meal: { type: Schema.Types.ObjectId, ref: 'Meal', required: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mealPlanEntrySchema.index({ user: 1, date: 1 })

export default model<IMealPlanEntry>('MealPlanEntry', mealPlanEntrySchema)
