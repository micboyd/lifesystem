import { Schema, model, Document, Types } from 'mongoose'

export type CourseKind = 'course' | 'block'

export interface ICourse extends Document {
    user: Types.ObjectId
    name: string
    /** 'course' for formal courses; 'block' for ad-hoc manual study blocks. */
    kind: CourseKind
    /** Free-text label describing a block (e.g. "Reading", "Revision"). */
    category?: string
    /** Total study hours the course requires to finish. */
    requiredHours: number
    /** Hours already completed; subtracted from requiredHours when projecting. */
    completedHours: number
    /** Priority position in the sequential study queue (lower = sooner). */
    order: number
    notes?: string
    link?: string
    /** Optional "YYYY-MM-DD" deadline used for on-track pacing. */
    targetDate?: string
    createdAt: Date
    updatedAt: Date
}

const courseSchema = new Schema<ICourse>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        kind: { type: String, enum: ['course', 'block'], default: 'course' },
        category: { type: String, trim: true },
        requiredHours: { type: Number, required: true, min: 0 },
        completedHours: { type: Number, default: 0, min: 0 },
        order: { type: Number, default: 0 },
        notes: { type: String, trim: true },
        link: { type: String, trim: true },
        targetDate: { type: String, trim: true },
    },
    { timestamps: true }
)

courseSchema.index({ user: 1, order: 1 })

export default model<ICourse>('Course', courseSchema)
