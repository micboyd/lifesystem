import { Schema, model, Document, Types } from 'mongoose'

export const PHOTO_KINDS = ['progress', 'goal'] as const
export const PHOTO_POSES = ['front', 'side', 'back'] as const
export type PhotoKind = (typeof PHOTO_KINDS)[number]
export type PhotoPose = (typeof PHOTO_POSES)[number]

/**
 * One body photo. `progress` photos are dated check-ins (the earliest per pose
 * is the "original"); `goal` photos are what you're aiming for — a reference
 * shot or an AI-made image of you at the target. The image itself lives in
 * Cloudinary as an authenticated asset; only its id is stored here.
 */
export interface IProgressPhoto extends Document {
    user: Types.ObjectId
    kind: PhotoKind
    pose: PhotoPose
    /** YYYY-MM-DD — the day it was taken (goal photos: the day added). */
    date: string
    publicId: string
    format: string
    version?: number
    width?: number
    height?: number
    note?: string
    createdAt: Date
    updatedAt: Date
}

const progressPhotoSchema = new Schema<IProgressPhoto>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        kind: { type: String, enum: PHOTO_KINDS, required: true },
        pose: { type: String, enum: PHOTO_POSES, required: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        publicId: { type: String, required: true },
        format: { type: String, required: true },
        version: Number,
        width: Number,
        height: Number,
        note: { type: String, trim: true },
    },
    { timestamps: true }
)

export default model<IProgressPhoto>('ProgressPhoto', progressPhotoSchema)
