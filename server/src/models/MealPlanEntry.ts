import { Schema, model, Document, Types } from 'mongoose'
import { MEAL_TYPES, MealType, IMacros, macrosSchema } from './Meal'

export const ENTRY_STATUSES = ['planned', 'eaten'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

/**
 * A meal on a day — a library meal, or a plate (see `plate`). Planned meals
 * sit in the planner until ticked; `extra` marks food logged through "Log
 * more", which goes straight in as eaten.
 *
 * `name` and `macros` are copied from the library meal when it's added, so
 * editing or deleting a library meal never changes a day that's been eaten.
 * Editing a meal does update the copies on days still only planned.
 */
/**
 * One line of a plate: grams of a box (from a particular cook) or of a plain
 * food, with the per-100 g figures it was worked out from.
 */
export interface IPlateLine {
    food: Types.ObjectId
    name: string
    grams: number
    /** The cook a box line draws from. Absent for plain foods. */
    batch?: Types.ObjectId
    per100: IMacros
}

const plateLineSchema = new Schema<IPlateLine>(
    {
        food: { type: Schema.Types.ObjectId, ref: 'PlateFood', required: true },
        name: { type: String, required: true, trim: true },
        grams: { type: Number, default: 0, min: 0 },
        batch: { type: Schema.Types.ObjectId, ref: 'BoxCook' },
        per100: { type: macrosSchema, default: () => ({}) },
    },
    { _id: false }
)

export interface IMealPlanEntry extends Document {
    user: Types.ObjectId
    /** "YYYY-MM-DD". */
    date: string
    slot: MealType
    meal?: Types.ObjectId
    /**
     * Set on a plate — foods weighed out by the gram. `macros` is then the
     * lines' total and `name` is built from them; `meal` is absent.
     */
    plate?: IPlateLine[]
    /**
     * Set on a box note — "eating from this box" planned ahead, with no
     * amounts. It carries no macros and is never ticked: weighing a plate of
     * that box into the same slot replaces it.
     */
    box?: Types.ObjectId
    /**
     * Set on an away note — "at an event, so no meal here". `name` is the
     * event's title (or whatever was typed). No macros and never ticked; the
     * slot simply counts as taken care of.
     */
    away?: boolean
    name: string
    macros: IMacros
    status: EntryStatus
    extra: boolean
    order: number
    createdAt: Date
    updatedAt: Date
}

const mealPlanEntrySchema = new Schema<IMealPlanEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        slot: { type: String, enum: MEAL_TYPES, required: true },
        meal: { type: Schema.Types.ObjectId, ref: 'Meal' },
        plate: { type: [plateLineSchema], default: undefined },
        box: { type: Schema.Types.ObjectId, ref: 'PlateFood' },
        away: { type: Boolean },
        name: { type: String, required: true, trim: true },
        macros: { type: macrosSchema, default: () => ({}) },
        status: { type: String, enum: ENTRY_STATUSES, default: 'planned' },
        extra: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mealPlanEntrySchema.index({ user: 1, date: 1 })

export default model<IMealPlanEntry>('MealPlanEntry', mealPlanEntrySchema)
