import { Schema, model, Document, Types } from 'mongoose'

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

/** A single recipe ingredient. Quantity and unit are free-text and optional. */
export interface IIngredient {
    name: string
    quantity?: string
    unit?: string
}

/** Per-serving macronutrients. */
export interface IMacros {
    calories: number
    protein: number
    carbs: number
    fat: number
}

export interface IMeal extends Document {
    user: Types.ObjectId
    name: string
    /** Which meals of the day this fits; a meal can belong to several. */
    types: MealType[]
    /** How many servings the recipe yields. Macros are stated per serving. */
    servings: number
    /** Optional label for one serving, e.g. "1 bowl", "2 pancakes". */
    servingLabel?: string
    /** Estimated prep time for a single serving, in minutes. */
    prepTime?: number
    /**
     * Fraction (0–1) of the single-serving prep that is one-time setup — tools,
     * preheating, cleanup — and so doesn't repeat per serving. Left unset, the
     * scaling uses a global default. Drives the batch estimate:
     * `estimate(n) = prepTime × (k + (1 − k) × n)`.
     */
    prepOverhead?: number
    macros: IMacros
    ingredients: IIngredient[]
    /** Ordered method steps. */
    method: string[]
    notes?: string
    link?: string
    /** Priority position in the library (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const ingredientSchema = new Schema<IIngredient>(
    {
        name: { type: String, required: true, trim: true },
        quantity: { type: String, trim: true },
        unit: { type: String, trim: true },
    },
    { _id: false }
)

const macrosSchema = new Schema<IMacros>(
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
        servings: { type: Number, default: 1, min: 1 },
        servingLabel: { type: String, trim: true },
        prepTime: { type: Number, min: 0 },
        prepOverhead: { type: Number, min: 0, max: 1 },
        macros: { type: macrosSchema, default: () => ({}) },
        ingredients: { type: [ingredientSchema], default: [] },
        method: { type: [String], default: [] },
        notes: { type: String, trim: true },
        link: { type: String, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mealSchema.index({ user: 1, order: 1 })

export default model<IMeal>('Meal', mealSchema)
