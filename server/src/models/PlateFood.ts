import { Schema, model, Document, Types } from 'mongoose'
import { IMacros, macrosSchema } from './Meal'

export const PLATE_FOOD_KINDS = ['box', 'plain'] as const
export type PlateFoodKind = (typeof PLATE_FOOD_KINDS)[number]

/**
 * A raw ingredient: how much goes in, and its packet macros per 100 g.
 * `items` is how many of it, for things bought by count (5 eggs) — the
 * shopping list buys that instead of the grams.
 */
export interface IIngredient {
    name: string
    grams: number
    items?: number
    per100: IMacros
}

export const ingredientSchema = new Schema<IIngredient>(
    {
        name: { type: String, required: true, trim: true },
        grams: { type: Number, default: 0, min: 0 },
        items: { type: Number, min: 0 },
        per100: { type: macrosSchema, default: () => ({}) },
    },
    { _id: false }
)

/**
 * Something weighed onto a plate. A `box` is cooked from raw `ingredients` —
 * each cook (a BoxCook) works out its macros per 100 g. A `plain` food (cooked
 * rice, say) just has `per100`.
 */
export interface IPlateFood extends Document {
    user: Types.ObjectId
    kind: PlateFoodKind
    name: string
    ingredients: IIngredient[]
    per100?: IMacros
    notes?: string
    order: number
    /** Set on boxes added by a JSON import, so the last import can be undone. */
    importBatch?: string | null
    createdAt: Date
    updatedAt: Date
}

const plateFoodSchema = new Schema<IPlateFood>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        kind: { type: String, enum: PLATE_FOOD_KINDS, required: true },
        name: { type: String, required: true, trim: true },
        ingredients: { type: [ingredientSchema], default: [] },
        per100: { type: macrosSchema },
        notes: { type: String, trim: true },
        order: { type: Number, default: 0 },
        importBatch: { type: String, default: null },
    },
    { timestamps: true }
)

plateFoodSchema.index({ user: 1, order: 1 })
plateFoodSchema.index({ user: 1, importBatch: 1 })

export default model<IPlateFood>('PlateFood', plateFoodSchema)
