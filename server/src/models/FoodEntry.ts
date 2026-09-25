import { Schema, model, Document, Types } from 'mongoose'
import { MEAL_TYPES, macrosSchema, type IMacros, type MealType } from './nutritionSchemas'

export const ENTRY_STATUSES = ['planned', 'eaten', 'skipped'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

export const ENTRY_UNITS = ['portion', 'g'] as const
export type EntryUnit = (typeof ENTRY_UNITS)[number]

/**
 * One line of a day: "1 portion of Tray A", "180 g Plain rice batch", "1 ×
 * eggs on toast", or a quick line with typed macros and nothing behind it.
 * A slot's lines add up to that meal; the day's lines to the day.
 *
 * Comes from a `batch` or a `recipe` (or neither, for a quick line). `macros`
 * is always stored: the server stamps it on every write, and re-stamps
 * *planned* lines when their batch or recipe changes. Eaten lines are never
 * re-stamped implicitly, so an edit can't rewrite a past day. Every total —
 * day, week, dashboard, energy maths — is a plain sum of `macros`.
 */
export interface IFoodEntry extends Document {
    user: Types.ObjectId
    /** "YYYY-MM-DD". */
    date: string
    slot: MealType
    status: EntryStatus
    batch?: Types.ObjectId
    recipe?: Types.ObjectId
    /** Name when written — survives the source being archived. */
    name: string
    amount: number
    unit: EntryUnit
    macros: IMacros
    /** Grams against an estimated cooked weight. */
    estimated?: boolean
    order: number
    createdAt: Date
    updatedAt: Date
}

const foodEntrySchema = new Schema<IFoodEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        slot: { type: String, enum: MEAL_TYPES, required: true },
        status: { type: String, enum: ENTRY_STATUSES, default: 'planned' },
        batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
        recipe: { type: Schema.Types.ObjectId, ref: 'Recipe' },
        name: { type: String, required: true, trim: true },
        amount: { type: Number, default: 1, min: 0 },
        unit: { type: String, enum: ENTRY_UNITS, default: 'portion' },
        macros: { type: macrosSchema, default: () => ({}) },
        estimated: { type: Boolean },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

foodEntrySchema.index({ user: 1, date: 1 })
foodEntrySchema.index({ user: 1, batch: 1, status: 1 })
foodEntrySchema.index({ user: 1, recipe: 1, status: 1 })

export default model<IFoodEntry>('FoodEntry', foodEntrySchema)
