import { Schema, model, Document, Types } from 'mongoose'

export const SHOPPING_KINDS = ['box', 'meal', 'food', 'item'] as const
export type ShoppingKind = (typeof SHOPPING_KINDS)[number]

/**
 * One thing added to the nutrition shopping list. A box carries its raw
 * ingredients for one batch (refreshed from the recipe whenever the list is
 * read), bought for `count` batches; a meal, a food or a typed-in `item` is
 * itself, `count` of them. The list the user shops from is all of these
 * merged into one line per ingredient name.
 */
export interface IShoppingGroup {
    id: string
    kind: ShoppingKind
    /** The meal or food it came from — none for a typed-in item. */
    ref?: Types.ObjectId
    name: string
    count: number
    /** A box's ingredients for one batch, or a meal's for one serving, as last seen. */
    ingredients: { name: string; grams: number; items?: number }[]
}

/** The user's one shopping list. */
export interface IShoppingList extends Document {
    user: Types.ObjectId
    groups: IShoppingGroup[]
    /** Lines in the basket, by lower-cased name. */
    ticked: string[]
    createdAt: Date
    updatedAt: Date
}

const groupSchema = new Schema<IShoppingGroup>(
    {
        id: { type: String, required: true },
        kind: { type: String, enum: SHOPPING_KINDS, required: true },
        ref: { type: Schema.Types.ObjectId },
        name: { type: String, required: true, trim: true },
        count: { type: Number, default: 1, min: 1 },
        ingredients: {
            type: [new Schema({ name: String, grams: Number, items: Number }, { _id: false })],
            default: [],
        },
    },
    { _id: false }
)

const shoppingListSchema = new Schema<IShoppingList>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        groups: { type: [groupSchema], default: [] },
        ticked: { type: [String], default: [] },
    },
    { timestamps: true }
)

export default model<IShoppingList>('ShoppingList', shoppingListSchema)
