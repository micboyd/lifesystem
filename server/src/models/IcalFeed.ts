import { Schema, model, Document, Types } from 'mongoose'

/**
 * A user's Google Calendar "secret address in iCal format". The address is a
 * password in all but name — anyone holding it can read the calendar — so it
 * is never selected by default and never sent back to the client in full.
 */
export interface IIcalFeed extends Document {
    user: Types.ObjectId
    url: string
    /** The calendar (layer) imported meetings land on. */
    calendar: Types.ObjectId
    lastSyncedAt?: Date | null
    /** When the last attempt ran, successful or not — throttles the sync-on-open. */
    lastAttemptAt?: Date | null
    lastError?: string | null
    /** Meetings stored by the last successful sync. */
    lastCount?: number
    createdAt: Date
    updatedAt: Date
}

const icalFeedSchema = new Schema<IIcalFeed>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        url: { type: String, required: true, select: false },
        calendar: { type: Schema.Types.ObjectId, ref: 'Calendar', required: true },
        lastSyncedAt: { type: Date, default: null },
        lastAttemptAt: { type: Date, default: null },
        lastError: { type: String, default: null },
        lastCount: { type: Number, default: 0 },
    },
    { timestamps: true }
)

export default model<IIcalFeed>('IcalFeed', icalFeedSchema)
