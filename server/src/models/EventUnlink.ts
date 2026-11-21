import { Schema, model, Document, Types } from 'mongoose'

/**
 * A payment the Statement auto-matched to a calendar event, which the user
 * unticked because the two weren't really related. `eventKey` is the event's
 * id and start date (`<id>|<YYYY-MM-DD>`), so one instance of a repeat can be
 * unlinked without the others.
 */
export interface IEventUnlink extends Document {
    user: Types.ObjectId
    /** Starling feedItemUid. */
    itemId: string
    eventKey: string
    createdAt: Date
    updatedAt: Date
}

const eventUnlinkSchema = new Schema<IEventUnlink>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        itemId: { type: String, required: true, maxlength: 100 },
        eventKey: { type: String, required: true, maxlength: 100 },
    },
    { timestamps: true }
)

eventUnlinkSchema.index({ user: 1, itemId: 1, eventKey: 1 }, { unique: true })

export default model<IEventUnlink>('EventUnlink', eventUnlinkSchema)
