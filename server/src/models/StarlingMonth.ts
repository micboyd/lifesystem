import { Schema, model, Document, Types } from 'mongoose'

/**
 * One finished month of Starling payments (in and out, every space), kept so
 * the Statement's year of trends and subscription spotting read from here
 * instead of asking Starling for twelve months on every visit.
 *
 * A month is re-read from Starling until it has been over for a few days
 * (late settlements and refunds), then it's final.
 */
export interface IStarlingMonthItem {
    id: string
    date: string
    time: string
    amount: number
    merchant: string | null
    category: string | null
    space: string
    direction: 'IN' | 'OUT'
    source: string | null
}

export interface IStarlingMonth extends Document {
    user: Types.ObjectId
    month: string // YYYY-MM
    items: IStarlingMonthItem[]
    fetchedAt: Date
}

const itemSchema = new Schema<IStarlingMonthItem>(
    {
        id: { type: String, required: true },
        date: { type: String, required: true },
        time: { type: String, required: true },
        amount: { type: Number, required: true },
        merchant: { type: String, default: null },
        category: { type: String, default: null },
        space: { type: String, required: true },
        direction: { type: String, enum: ['IN', 'OUT'], required: true },
        source: { type: String, default: null },
    },
    { _id: false }
)

const starlingMonthSchema = new Schema<IStarlingMonth>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    items: { type: [itemSchema], default: [] },
    fetchedAt: { type: Date, required: true },
})

starlingMonthSchema.index({ user: 1, month: 1 }, { unique: true })

export default model<IStarlingMonth>('StarlingMonth', starlingMonthSchema)
