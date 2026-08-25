import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const WORK_PROJECT_STATUSES = ['active', 'paused', 'done', 'archived'] as const
export type WorkProjectStatus = (typeof WORK_PROJECT_STATUSES)[number]

/**
 * Accent colours for the project chip. Stored as a name rather than a class so
 * the client owns the palette — Tailwind v4 scans source text, so the class
 * strings have to be spelled out there in full anyway.
 */
export const WORK_PROJECT_COLORS = [
    'slate',
    'blue',
    'violet',
    'emerald',
    'amber',
    'rose',
    'teal',
] as const
export type WorkProjectColor = (typeof WORK_PROJECT_COLORS)[number]

export interface IWorkProject extends Document {
    user: Types.ObjectId
    name: string
    /** What the project is — stable, written once. */
    summary?: string
    /**
     * Where it's at right now — rewritten as things move. Kept apart from
     * `summary` so the page can show how long it's been since anyone updated
     * it: a project whose state is three weeks old is the actual signal.
     */
    state?: string
    stateUpdatedAt?: Date | null
    status: WorkProjectStatus
    dueDate?: string
    color: WorkProjectColor
    order: number
    createdAt: Date
    updatedAt: Date
}

const workProjectSchema = new Schema<IWorkProject>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 200 },
        summary: { type: String, trim: true, maxlength: 2000 },
        state: { type: String, trim: true, maxlength: 2000 },
        stateUpdatedAt: { type: Date, default: null },
        status: { type: String, enum: WORK_PROJECT_STATUSES, default: 'active' },
        dueDate: { type: String, match: DATE_PATTERN },
        color: { type: String, enum: WORK_PROJECT_COLORS, default: 'slate' },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

workProjectSchema.index({ user: 1, status: 1, order: 1 })

export default model<IWorkProject>('WorkProject', workProjectSchema)
