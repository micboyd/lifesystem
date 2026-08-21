import { Schema, model, Document, Types } from 'mongoose'

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Which angle the photo was taken from. Three is enough to see a change. */
export const PHOTO_VIEWS = ['front', 'side', 'back'] as const
export type PhotoView = (typeof PHOTO_VIEWS)[number]

/** Image types accepted. Deliberately short — anything else is a mistake or a probe. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * A progress photo, stored as bytes in its own collection.
 *
 * Its own collection because the alternative — embedding the image in the
 * check-in — would make listing a year of check-ins drag tens of megabytes
 * across the wire to render a list of dates. Here the check-in list stays small
 * and each image is fetched only when something actually displays it.
 *
 * Bytes in Mongo rather than on disk because the app runs on a platform with an
 * ephemeral filesystem: anything written beside the process disappears on the
 * next restart, which is a poor place for the only copy of nine months of
 * progress photos. There is no object store configured, and introducing one for
 * this would be a larger commitment than the feature warrants. The client
 * downscales before upload, so these are a few hundred kilobytes each — far
 * inside the document limit, and the collection stays small because the cadence
 * is monthly.
 *
 * These are the most personal records in the app. They are reachable only
 * through an authenticated route filtered by owner, addressed by an
 * unguessable id, never served from a public path, and the bytes are deleted
 * with the record rather than orphaned.
 */
export interface IProgressPhoto extends Document {
    user: Types.ObjectId
    /** YYYY-MM-DD — the day the photo was taken. */
    date: string
    view: PhotoView
    contentType: string
    /** The image itself. Never returned by the list endpoint. */
    data: Buffer
    /** Size in bytes, so a listing can be shown without loading the image. */
    bytes: number
    createdAt: Date
    updatedAt: Date
}

const progressPhotoSchema = new Schema<IProgressPhoto>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        view: { type: String, enum: PHOTO_VIEWS, required: true },
        contentType: { type: String, required: true, enum: PHOTO_TYPES },
        // `select: false` so the bytes are opt-in: every ordinary query for a
        // listing gets the metadata and leaves the image behind, and only the
        // one route that streams an image asks for it.
        data: { type: Buffer, required: true, select: false },
        bytes: { type: Number, required: true, min: 0 },
    },
    { timestamps: true }
)

// One photo per angle per day; re-uploading replaces rather than accumulating.
progressPhotoSchema.index({ user: 1, date: 1, view: 1 }, { unique: true })

export default model<IProgressPhoto>('ProgressPhoto', progressPhotoSchema)
