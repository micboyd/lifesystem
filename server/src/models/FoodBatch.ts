import { Schema, model, Document, Types } from 'mongoose'
import { IMacros } from './Meal'
import { macrosSchema } from './Food'
import {
    PREP_CATEGORIES,
    PrepCategory,
    IPrepIngredient,
    prepIngredientSchema,
} from './PrepRecipe'

export const BATCH_STATUSES = ['active', 'finished', 'discarded'] as const
export type BatchStatus = (typeof BATCH_STATUSES)[number]
export const STORAGE = ['fridge', 'freezer'] as const
export type Storage = (typeof STORAGE)[number]

/**
 * Food actually cooked: one tray, weighed, sitting in the fridge or freezer.
 *
 * Everything nutritional is a snapshot taken when it was saved — the
 * ingredients as actually used, their totals, the cooked weight and the density
 * derived from them. Two batches of the same recipe keep their own densities, and
 * editing the recipe later changes neither.
 *
 * `remainingGrams` is the running balance of the `StockMovement` ledger, kept on
 * the batch so a conditional `$inc` can refuse to take it below zero atomically.
 * `reconciledAt` is the last time the balance was *measured* rather than
 * derived; meals logged before it no longer move the stock when edited.
 *
 * Batches are never deleted — meal history points at them. They are finished or
 * discarded.
 */
export interface IFoodBatch extends Document {
    user: Types.ObjectId
    recipe?: Types.ObjectId
    /** Snapshot of the recipe's name and category at cooking time. */
    name: string
    category: PrepCategory
    /** Your own identifier, e.g. "Sunday tray". */
    label?: string
    cookedDate: string
    ingredients: IPrepIngredient[]
    totals: IMacros
    cookedGrams: number
    per100: IMacros
    remainingGrams: number
    storage: Storage
    thawedDate?: string
    useBy?: string
    status: BatchStatus
    reconciledAt?: Date
    /** How the net weight was reached, when it was weighed in a container. */
    weighing?: { grossGrams: number; containerGrams: number; containerName?: string }
    createdAt: Date
    updatedAt: Date
}

const foodBatchSchema = new Schema<IFoodBatch>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        recipe: { type: Schema.Types.ObjectId, ref: 'PrepRecipe' },
        name: { type: String, required: true, trim: true },
        category: { type: String, enum: PREP_CATEGORIES, default: 'main' },
        label: { type: String, trim: true },
        cookedDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        ingredients: { type: [prepIngredientSchema], default: [] },
        totals: { type: macrosSchema, required: true },
        cookedGrams: { type: Number, required: true, min: 1 },
        per100: { type: macrosSchema, required: true },
        // min 0 is the last line of defence; controllers refuse first.
        remainingGrams: { type: Number, required: true, min: 0 },
        storage: { type: String, enum: STORAGE, default: 'fridge' },
        thawedDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
        useBy: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
        status: { type: String, enum: BATCH_STATUSES, default: 'active' },
        reconciledAt: { type: Date },
        weighing: {
            type: new Schema(
                {
                    grossGrams: { type: Number, min: 0 },
                    containerGrams: { type: Number, min: 0 },
                    containerName: { type: String, trim: true },
                },
                { _id: false }
            ),
            default: undefined,
        },
    },
    { timestamps: true }
)

foodBatchSchema.index({ user: 1, status: 1, cookedDate: 1 })

export default model<IFoodBatch>('FoodBatch', foodBatchSchema)
