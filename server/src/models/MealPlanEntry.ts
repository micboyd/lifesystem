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

export const BUFFET_ROLES = ['main', 'side', 'extra'] as const
export type BuffetRole = (typeof BUFFET_ROLES)[number]
export const COMPONENT_SOURCES = ['batch', 'recipe', 'food'] as const
export type ComponentSource = (typeof COMPONENT_SOURCES)[number]

/**
 * One weighed item on a buffet plate.
 *
 * `source` says what the grams come out of: a cooked `batch` (tracked stock), a
 * `recipe` not yet cooked (planning only — it must be resolved to a batch or a
 * food before it can be eaten), or a `food` label (packaged, untracked).
 *
 * `per100` is the density the figures were costed at and `macros` the result for
 * whichever grams count — `grams` once eaten, `plannedGrams` before. Both are
 * snapshots, so a logged meal's totals never move when a recipe is edited.
 * `estimated` marks a density from an estimated or previous yield rather than
 * the batch actually eaten from.
 */
export interface IBuffetComponent {
    _id: Types.ObjectId
    role: BuffetRole
    source: ComponentSource
    recipe?: Types.ObjectId
    batch?: Types.ObjectId
    food?: Types.ObjectId
    name: string
    per100: IMacros
    estimated: boolean
    plannedGrams?: number
    grams?: number
    macros: IMacros
}

/**
 * A meal built from weighed components rather than a recipe's servings.
 *
 * `rev` increments on every write, and writes must name the revision they were
 * made against — so a double-submitted log, or two tabs editing the same meal,
 * is refused rather than deducting stock twice. `loggedAt` is when it was first
 * logged as eaten: the moment its stock left the batch, which is what later
 * stock corrections are ordered against.
 */
export interface IBuffetMeal {
    name?: string
    components: IBuffetComponent[]
    rev: number
    loggedAt?: Date
}

/**
 * A single meal placed into one slot of one day in the weekly planner.
 *
 * An entry is a library meal (`meal`), a one-off (`adhoc`) or a buffet plate
 * (`buffet`) — exactly one of them. Library macros are not stored here; they are read from
 * the referenced meal at display time and scaled by `servings`, so edits to a
 * recipe flow through to every plan it sits in. Ad-hoc entries carry their own
 * macros because there's no recipe to read them from.
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
    /** Set instead of `meal` for a plate weighed out of prepared batches. */
    buffet?: IBuffetMeal
    /**
     * Idempotency key for a meal created already-eaten, so a retried request
     * returns the first meal instead of logging (and deducting) a second.
     */
    clientKey?: string
    /**
     * How many servings are on the plate. Recipe macros are stated per serving,
     * so this scales them — 2 for a double portion, 0.5 for half. Without it a
     * bulk is inexpressible: eating more of the same meals is the whole method.
     * Ad-hoc entries scale the same way.
     */
    servings: number
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

const componentMacrosSchema = new Schema<IMacros>(
    {
        calories: { type: Number, default: 0, min: 0 },
        protein: { type: Number, default: 0, min: 0 },
        carbs: { type: Number, default: 0, min: 0 },
        fat: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
)

const buffetComponentSchema = new Schema<IBuffetComponent>({
    role: { type: String, enum: BUFFET_ROLES, default: 'main' },
    source: { type: String, enum: COMPONENT_SOURCES, required: true },
    recipe: { type: Schema.Types.ObjectId, ref: 'PrepRecipe' },
    batch: { type: Schema.Types.ObjectId, ref: 'FoodBatch' },
    food: { type: Schema.Types.ObjectId, ref: 'Food' },
    name: { type: String, required: true, trim: true },
    per100: { type: componentMacrosSchema, required: true },
    estimated: { type: Boolean, default: false },
    plannedGrams: { type: Number, min: 0 },
    grams: { type: Number, min: 0 },
    macros: { type: componentMacrosSchema, required: true },
})

const buffetSchema = new Schema<IBuffetMeal>(
    {
        name: { type: String, trim: true },
        components: { type: [buffetComponentSchema], default: [] },
        rev: { type: Number, default: 0 },
        loggedAt: { type: Date },
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
        buffet: { type: buffetSchema, default: undefined },
        clientKey: { type: String },
        // Fractional portions are allowed; the controller keeps it above zero,
        // since a zero-serving entry is a skip expressed the confusing way.
        servings: { type: Number, default: 1, min: 0 },
        status: { type: String, enum: ENTRY_STATUSES, default: 'planned' },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mealPlanEntrySchema.index({ user: 1, date: 1 })
mealPlanEntrySchema.index(
    { user: 1, clientKey: 1 },
    { unique: true, partialFilterExpression: { clientKey: { $type: 'string' } } }
)

export default model<IMealPlanEntry>('MealPlanEntry', mealPlanEntrySchema)
