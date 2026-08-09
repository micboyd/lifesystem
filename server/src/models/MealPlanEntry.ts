import { Schema, model, Document, Types } from 'mongoose'
import { MEAL_TYPES, MealType, IMacros } from './Meal'

/**
 * Whether the planned meal was actually eaten. Everything starts 'planned';
 * marking it turns the week from an intention into a record of what happened,
 * which is the only version the numbers can be trusted from.
 */
export const ENTRY_STATUSES = ['planned', 'eaten', 'skipped'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

/** Food eaten that wasn't in the library — logged with macros, not a recipe. */
export interface IAdhocMeal {
    name: string
    macros: IMacros
}

/**
 * A single meal placed into one slot of one day in the weekly planner.
 *
 * An entry is either a library meal (`meal`) or a one-off (`adhoc`) — never
 * both, never neither. Library macros are not stored here; they are read from
 * the referenced meal at display time, so edits to a recipe flow through to
 * every plan it sits in. Ad-hoc entries carry their own macros because there's
 * no recipe to read them from.
 */
export interface IMealPlanEntry extends Document {
    user: Types.ObjectId
    /** The day this sits on, "YYYY-MM-DD". */
    date: string
    /** Which slot of the day: breakfast / lunch / dinner / snack. */
    slot: MealType
    meal?: Types.ObjectId
    /** Set instead of `meal` for off-plan food. */
    adhoc?: IAdhocMeal
    /** Whether it was eaten. Defaults to 'planned'. */
    status: EntryStatus
    /** Position within the day+slot (lower = sooner); mainly for snacks. */
    order: number
    createdAt: Date
    updatedAt: Date
}

const adhocMacrosSchema = new Schema<IMacros>(
    {
        calories: { type: Number, default: 0, min: 0 },
        protein: { type: Number, default: 0, min: 0 },
        carbs: { type: Number, default: 0, min: 0 },
        fat: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
)

const adhocSchema = new Schema<IAdhocMeal>(
    {
        name: { type: String, required: true, trim: true },
        macros: { type: adhocMacrosSchema, default: () => ({}) },
    },
    { _id: false }
)

const mealPlanEntrySchema = new Schema<IMealPlanEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        slot: { type: String, enum: MEAL_TYPES, required: true },
        meal: { type: Schema.Types.ObjectId, ref: 'Meal' },
        adhoc: { type: adhocSchema, default: undefined },
        status: { type: String, enum: ENTRY_STATUSES, default: 'planned' },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mealPlanEntrySchema.index({ user: 1, date: 1 })

export default model<IMealPlanEntry>('MealPlanEntry', mealPlanEntrySchema)
