import { Schema, model, Document, Types } from 'mongoose'
import { IMacros, macrosSchema } from './Meal'
import { IIngredient, ingredientSchema } from './PlateFood'

/**
 * One cook of a box — a batch. What went in raw (copied from the box, with
 * any grams changed that day), what it weighed cooked, and so its macros per
 * 100 g. Open until marked finished; plates draw from the newest open batch.
 */
export interface IBoxCook extends Document {
    user: Types.ObjectId
    food: Types.ObjectId
    /** The box's name when cooked. */
    name: string
    /** "YYYY-MM-DD". */
    date: string
    ingredients: IIngredient[]
    raw: IMacros
    cookedGrams: number
    per100: IMacros
    finished: boolean
    createdAt: Date
    updatedAt: Date
}

const boxCookSchema = new Schema<IBoxCook>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        food: { type: Schema.Types.ObjectId, ref: 'PlateFood', required: true },
        name: { type: String, required: true, trim: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        ingredients: { type: [ingredientSchema], default: [] },
        raw: { type: macrosSchema, default: () => ({}) },
        cookedGrams: { type: Number, required: true, min: 1 },
        per100: { type: macrosSchema, default: () => ({}) },
        finished: { type: Boolean, default: false },
    },
    { timestamps: true }
)

boxCookSchema.index({ user: 1, food: 1, finished: 1 })

export default model<IBoxCook>('BoxCook', boxCookSchema)
