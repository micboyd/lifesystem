import { Schema, model, Document, Types } from 'mongoose'

export const RELATIONSHIPS = ['manager', 'report', 'peer', 'stakeholder', 'external'] as const
export type Relationship = (typeof RELATIONSHIPS)[number]

export interface IPerson extends Document {
    user: Types.ObjectId
    name: string
    role?: string
    team?: string
    relationship: Relationship
    notes?: string
    /**
     * Archived people stay attached to the tasks that already reference them —
     * deleting someone would leave "waiting on ???" behind — but drop out of
     * the pickers so a leaver stops being offered.
     */
    archived: boolean
    createdAt: Date
    updatedAt: Date
}

const personSchema = new Schema<IPerson>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        role: { type: String, trim: true, maxlength: 120 },
        team: { type: String, trim: true, maxlength: 120 },
        relationship: { type: String, enum: RELATIONSHIPS, default: 'peer' },
        notes: { type: String, trim: true, maxlength: 4000 },
        archived: { type: Boolean, default: false },
    },
    { timestamps: true }
)

personSchema.index({ user: 1, archived: 1, name: 1 })

export default model<IPerson>('Person', personSchema)
