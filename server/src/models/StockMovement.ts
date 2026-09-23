import { Schema, model, Document, Types } from 'mongoose'

export const MOVEMENT_KINDS = [
    'cook', // the batch was created with its cooked weight
    'consume', // a logged meal took some
    'restore', // a logged meal was edited down, moved or deleted
    'others', // someone else ate some — not your macros
    'discard', // thrown away
    'correction', // weighed again; the balance is set to what the scale says
    'move', // fridge ↔ freezer; no stock change
    'finish', // marked finished; the balance is set to zero
] as const
export type MovementKind = (typeof MOVEMENT_KINDS)[number]

/**
 * The stock ledger: every change to a batch's remaining weight, and why.
 *
 * Append-only. `grams` is the signed change actually applied (zero for a move,
 * or for an edit to a meal the stock has since been measured past — those carry
 * `sealed`). `balanceAfter` makes the history readable without replaying it.
 *
 * `requestId` makes a stock adjustment idempotent: the unique index turns a
 * double-tapped "Someone else ate some" into one movement, not two.
 */
export interface IStockMovement extends Document {
    user: Types.ObjectId
    batch: Types.ObjectId
    kind: MovementKind
    grams: number
    balanceAfter: number
    sealed?: boolean
    entry?: Types.ObjectId
    /** YYYY-MM-DD, in the user's calendar. */
    date: string
    note?: string
    requestId?: string
    createdAt: Date
    updatedAt: Date
}

const stockMovementSchema = new Schema<IStockMovement>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        batch: { type: Schema.Types.ObjectId, ref: 'FoodBatch', required: true },
        kind: { type: String, enum: MOVEMENT_KINDS, required: true },
        grams: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        sealed: { type: Boolean },
        entry: { type: Schema.Types.ObjectId, ref: 'MealPlanEntry' },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        note: { type: String, trim: true },
        requestId: { type: String },
    },
    { timestamps: true }
)

stockMovementSchema.index({ user: 1, batch: 1, createdAt: 1 })
stockMovementSchema.index(
    { user: 1, requestId: 1 },
    { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } }
)

export default model<IStockMovement>('StockMovement', stockMovementSchema)
