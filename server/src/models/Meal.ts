import { Schema, model, Document, Types } from 'mongoose'

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export interface IMacros {
    calories: number
    protein: number
    carbs: number
    fat: number
}

/** A meal in the library: a name, which meals of the day it's for, and its macros. */
export interface IMeal extends Document {
    user: Types.ObjectId
    name: string
    /** Breakfast / lunch / dinner / snack — a meal can be more than one. */
    types: MealType[]
    macros: IMacros
    notes?: string
    order: number
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
        notes: { type: String, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mealSchema.index({ user: 1, order: 1 })

export default model<IMeal>('Meal', mealSchema)
