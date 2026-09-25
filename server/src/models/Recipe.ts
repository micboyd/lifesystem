import { Schema, model, Document, Types } from 'mongoose'
import {
    MEAL_TYPES,
    ingredientSchema,
    macrosSchema,
    type IIngredient,
    type IMacros,
    type MealType,
} from './nutritionSchemas'

/** A one-tap amount for the log screen, e.g. rice "Small" = 50 g dry. */
export interface IRecipePreset {
    label: string
    amount: number
    unit: 'portion' | 'g'
    /** Guidance only, e.g. "≈ 150 g cooked". */
    hint?: string
}

/**
 * What you make or eat: scrambled eggs on toast, a Greek lemon chicken tray, a
 * pot of yoghurt, dry basmati rice.
 *
 * Macros come from the ingredients' label figures or, when none are costed,
 * from `macros` typed per portion (see `lib/recipeMath`). `servings` is the
 * default portions a cook makes — a batch copies it and can override it.
 *
 * `cookedGrams` is for things eaten straight by weight with no cook in between
 * (yoghurt, dry rice by the dry gram): the weight of the whole thing as listed.
 * Cooked food gets its weight on the batch instead; `estimatedCookedGrams` is
 * the fallback a new batch starts from.
 */
export interface IRecipe extends Document {
    user: Types.ObjectId
    name: string
    /** Which meals of the day it suits; orders the picker. */
    types: MealType[]
    ingredients: IIngredient[]
    macros?: IMacros
    servings: number
    cookedGrams?: number
    estimatedCookedGrams?: number
    presets: IRecipePreset[]
    method: string[]
    notes?: string
    link?: string
    /** Companion PDF, and the page this recipe is on. */
    guideUrl?: string
    guidePage?: number
    /**
     * The guide's own per-portion estimate. Shown beside the app's figures to
     * catch data-entry mistakes; never used for tracking.
     */
    guideEstimate?: IMacros
    order: number
    /** Hidden from pickers; kept so past entries still resolve. */
    archived: boolean
    createdAt: Date
    updatedAt: Date
}

const presetSchema = new Schema<IRecipePreset>(
    {
        label: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
        unit: { type: String, enum: ['portion', 'g'], default: 'portion' },
        hint: { type: String, trim: true },
    },
    { _id: false }
)

const recipeSchema = new Schema<IRecipe>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        types: [{ type: String, enum: MEAL_TYPES }],
        ingredients: { type: [ingredientSchema], default: [] },
        macros: { type: macrosSchema, default: undefined },
        servings: { type: Number, default: 1, min: 0 },
        cookedGrams: { type: Number, min: 0 },
        estimatedCookedGrams: { type: Number, min: 0 },
        presets: { type: [presetSchema], default: [] },
        method: { type: [String], default: [] },
        notes: { type: String, trim: true },
        link: { type: String, trim: true },
        guideUrl: { type: String, trim: true },
        guidePage: { type: Number, min: 1 },
        guideEstimate: { type: macrosSchema, default: undefined },
        order: { type: Number, default: 0 },
        archived: { type: Boolean, default: false },
    },
    { timestamps: true }
)

recipeSchema.index({ user: 1, order: 1 })

export default model<IRecipe>('Recipe', recipeSchema)
