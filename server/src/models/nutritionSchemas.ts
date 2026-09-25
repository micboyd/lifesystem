import { Schema } from 'mongoose'
import { INGREDIENT_UNITS, type Ingredient, type Macros } from '../lib/recipeMath'

/** Sub-schemas shared by Recipe, Batch and FoodEntry. */

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export type IMacros = Macros
export type IIngredient = Ingredient

export const macrosSchema = new Schema<IMacros>(
    {
        calories: { type: Number, default: 0, min: 0 },
        protein: { type: Number, default: 0, min: 0 },
        carbs: { type: Number, default: 0, min: 0 },
        fat: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
)

const packSchema = new Schema(
    {
        size: { type: Number, required: true, min: 0 },
        label: { type: String, trim: true },
    },
    { _id: false }
)

export const ingredientSchema = new Schema<IIngredient>(
    {
        name: { type: String, required: true, trim: true },
        amount: { type: Number, min: 0 },
        unit: { type: String, enum: INGREDIENT_UNITS, default: 'g' },
        per: { type: macrosSchema, default: undefined },
        pack: { type: packSchema, default: undefined },
        drained: { type: Boolean },
    },
    { _id: false }
)
