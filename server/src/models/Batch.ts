import { Schema, model, Document, Types } from 'mongoose'
import { ingredientSchema, macrosSchema, type IIngredient, type IMacros } from './nutritionSchemas'

/**
 * One time you cooked a recipe — "Tray A — Greek lemon chicken", 24 Sep.
 *
 * A batch copies the recipe's ingredients when it's made, so this cook can use
 * a different jar or less oil without touching the recipe, and editing the
 * recipe later never reaches it. Two oven trays that make one lot of food are
 * one batch.
 *
 * Portions need no weight. Grams need `cookedGrams` (weighed, without trays or
 * containers) or fall back to `estimatedCookedGrams`, and are then labelled as
 * estimates. There is deliberately no remaining-quantity tracking.
 */
export interface IBatch extends Document {
    user: Types.ObjectId
    recipe?: Types.ObjectId
    name: string
    /** "YYYY-MM-DD". */
    cookedOn: string
    ingredients: IIngredient[]
    macros?: IMacros
    servings: number
    cookedGrams?: number
    estimatedCookedGrams?: number
    notes?: string
    /** Finished or no longer in the fridge — hidden from "My batches". */
    archived: boolean
    createdAt: Date
    updatedAt: Date
}

const batchSchema = new Schema<IBatch>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        recipe: { type: Schema.Types.ObjectId, ref: 'Recipe' },
        name: { type: String, required: true, trim: true },
        cookedOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        ingredients: { type: [ingredientSchema], default: [] },
        macros: { type: macrosSchema, default: undefined },
        servings: { type: Number, default: 1, min: 0 },
        cookedGrams: { type: Number, min: 0 },
        estimatedCookedGrams: { type: Number, min: 0 },
        notes: { type: String, trim: true },
        archived: { type: Boolean, default: false },
    },
    { timestamps: true }
)

batchSchema.index({ user: 1, archived: 1, cookedOn: -1 })

export default model<IBatch>('Batch', batchSchema)
