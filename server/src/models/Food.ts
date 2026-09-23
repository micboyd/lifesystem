import { Schema, model, Document, Types } from 'mongoose'
import { IMacros } from './Meal'

/**
 * A saved nutrition label — what an ingredient or a packaged side is made of.
 *
 * The meal library states macros per serving and has no notion of a raw
 * ingredient, so batch cooking needs somewhere to keep "chicken breast, raw:
 * 106 kcal per 100 g". Labels are per 100 g or per 100 ml (`basis`); crossing
 * between the two needs `density`, and counting items needs `unitGrams` —
 * neither is ever assumed.
 *
 * Archived rather than deleted: recipes and batches snapshot the figures, but
 * the list of foods you actually use shouldn't lose one quietly.
 */
export interface IFood extends Document {
    user: Types.ObjectId
    name: string
    brand?: string
    basis: 'g' | 'ml'
    per100: IMacros
    /** Grams per millilitre. */
    density?: number
    /** Grams per item, e.g. one egg. */
    unitGrams?: number
    archived: boolean
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

const foodSchema = new Schema<IFood>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        brand: { type: String, trim: true },
        basis: { type: String, enum: ['g', 'ml'], default: 'g' },
        per100: { type: macrosSchema, default: () => ({}) },
        density: { type: Number, min: 0 },
        unitGrams: { type: Number, min: 0 },
        archived: { type: Boolean, default: false },
    },
    { timestamps: true }
)

export default model<IFood>('Food', foodSchema)
