import { Schema, model, Document, Types } from 'mongoose'
import { IMacros } from './Meal'
import { macrosSchema } from './Food'

export const PREP_CATEGORIES = ['main', 'side', 'extra'] as const
export type PrepCategory = (typeof PREP_CATEGORIES)[number]

export const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'item'] as const

/** The nutrition an ingredient line is costed with — a copy, not a live link. */
export interface INutritionSource {
    basis: 'g' | 'ml'
    per100: IMacros
    density?: number
    unitGrams?: number
}

export interface IPrepIngredient {
    name: string
    /** The saved label it was chosen from, if any. Kept for reuse, not for maths. */
    food?: Types.ObjectId
    quantity: number
    unit: (typeof INGREDIENT_UNITS)[number]
    nutrition: INutritionSource
}

/**
 * A tray or side in the Tray & Sides library: what usually goes in, and the
 * figures to cost it with.
 *
 * Kept apart from `Meal` on purpose. A library meal states macros *per serving*
 * and is placed whole into the planner; a prep recipe states *batch totals* and
 * is never eaten directly — it is cooked into a `FoodBatch` and weighed out.
 * Putting both in one collection would have every planner picker offering a
 * 3,000 kcal tray as a lunch.
 *
 * Editing a recipe never reaches a batch: batches copy the ingredients they were
 * actually cooked with.
 */
export interface IPrepRecipe extends Document {
    user: Types.ObjectId
    name: string
    category: PrepCategory
    ingredients: IPrepIngredient[]
    instructions?: string
    prepMinutes?: number
    /** The most recent measured cooked weight, copied in when a batch is saved. */
    lastYieldGrams?: number
    lastYieldDate?: string
    /** A user-entered guess, used for planning only until a batch is weighed. */
    estimatedYieldGrams?: number
    /** Your usual portion; beats the one inferred from history. */
    usualPortionGrams?: number
    /** When to warn: fewer than this many portions (or grams) left. */
    lowStock?: { unit: 'portions' | 'grams'; value: number }
    /** Days of notice you want before running out. */
    leadDays?: number
    favourite: boolean
    archived: boolean
    order: number
    createdAt: Date
    updatedAt: Date
}

export const nutritionSourceSchema = new Schema<INutritionSource>(
    {
        basis: { type: String, enum: ['g', 'ml'], default: 'g' },
        per100: { type: macrosSchema, default: () => ({}) },
        density: { type: Number, min: 0 },
        unitGrams: { type: Number, min: 0 },
    },
    { _id: false }
)

export const prepIngredientSchema = new Schema<IPrepIngredient>(
    {
        name: { type: String, required: true, trim: true },
        food: { type: Schema.Types.ObjectId, ref: 'Food' },
        quantity: { type: Number, required: true, min: 0 },
        unit: { type: String, enum: INGREDIENT_UNITS, default: 'g' },
        nutrition: { type: nutritionSourceSchema, required: true },
    },
    { _id: false }
)

const prepRecipeSchema = new Schema<IPrepRecipe>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        category: { type: String, enum: PREP_CATEGORIES, default: 'main' },
        ingredients: { type: [prepIngredientSchema], default: [] },
        instructions: { type: String, trim: true },
        prepMinutes: { type: Number, min: 0 },
        lastYieldGrams: { type: Number, min: 0 },
        lastYieldDate: { type: String },
        estimatedYieldGrams: { type: Number, min: 0 },
        usualPortionGrams: { type: Number, min: 0 },
        lowStock: {
            type: new Schema(
                {
                    unit: { type: String, enum: ['portions', 'grams'], default: 'portions' },
                    value: { type: Number, min: 0, default: 2 },
                },
                { _id: false }
            ),
            default: undefined,
        },
        leadDays: { type: Number, min: 0 },
        favourite: { type: Boolean, default: false },
        archived: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

prepRecipeSchema.index({ user: 1, archived: 1, order: 1 })

export default model<IPrepRecipe>('PrepRecipe', prepRecipeSchema)
