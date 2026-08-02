import { Schema, model, Document, Types } from 'mongoose'

export const CHECKLIST_COLORS = [
    'neutral',
    'emerald',
    'sky',
    'violet',
    'amber',
    'rose',
    'teal',
] as const
export type ChecklistColor = (typeof CHECKLIST_COLORS)[number]

/** A single tickable line within a group. */
export interface IChecklistItem {
    _id: Types.ObjectId
    text: string
    done: boolean
    order: number
}

/** A named cluster of items. An empty name renders as an ungrouped section. */
export interface IChecklistGroup {
    _id: Types.ObjectId
    name: string
    items: IChecklistItem[]
    order: number
}

export interface IChecklist extends Document {
    user: Types.ObjectId
    title: string
    description?: string
    color: ChecklistColor
    groups: IChecklistGroup[]
    order: number
    createdAt: Date
    updatedAt: Date
}

const itemSchema = new Schema<IChecklistItem>(
    {
        text: { type: String, required: true, trim: true },
        done: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
    },
    { _id: true }
)

const groupSchema = new Schema<IChecklistGroup>(
    {
        name: { type: String, default: '', trim: true },
        items: { type: [itemSchema], default: [] },
        order: { type: Number, default: 0 },
    },
    { _id: true }
)

const checklistSchema = new Schema<IChecklist>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        color: { type: String, enum: CHECKLIST_COLORS, default: 'neutral' },
        groups: { type: [groupSchema], default: [] },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

export default model<IChecklist>('Checklist', checklistSchema)
