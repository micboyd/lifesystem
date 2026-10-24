import { Schema, model, Document, Types } from 'mongoose'

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export interface IMacros {
    calories: number
    protein: number
    carbs: number
    fat: number
}

/** One serving's worth: grams, or `items` for things bought by count (5 eggs), or both. */
export interface IMealIngredient {
    name: string
    grams: number
    items?: number
}

/** A meal in the library: a name, which meals of the day it's for, and its macros. */
export interface IMeal extends Document {
    user: Types.ObjectId
    name: string
    /** Breakfast / lunch / dinner / snack — a meal can be more than one. */
    types: MealType[]
    macros: IMacros
    /** What goes into one serving — what the shopping list buys. */
    ingredients: IMealIngredient[]
    notes?: string
    order: number
    /** Set on meals added by a JSON import, so the last import can be undone. */
    importBatch?: string | null
    createdAt: Date
    updatedAt: Date
}

export const macrosSchema = new Schema<IMacros>(
    {
        calories: { type: Number, default: 0, min: 0 },
        protein: { type: Number, default: 0, min: 0 },
        carbs: { type: Number, default: 0, min: 0 },
        fat: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
)

const mealSchema = new Schema<IMeal>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        types: [{ type: String, enum: MEAL_TYPES }],
        macros: { type: macrosSchema, default: () => ({}) },
        ingredients: {
            type: [
                new Schema<IMealIngredient>(
                    { name: { type: String, trim: true }, grams: { type: Number, default: 0 }, items: Number },
                    { _id: false }
                ),
            ],
            default: [],
        },
        notes: { type: String, trim: true },
        order: { type: Number, default: 0 },
        importBatch: { type: String, default: null },
    },
    { timestamps: true }
)

mealSchema.index({ user: 1, order: 1 })
mealSchema.index({ user: 1, importBatch: 1 })

export default model<IMeal>('Meal', mealSchema)
