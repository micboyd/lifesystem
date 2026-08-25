import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * `waiting` is a status rather than its own collection: an item you're blocked
 * on is the same piece of work as the task that produced it, and making it a
 * separate record would mean copying a task across when it becomes blocked and
 * copying it back when it unblocks. The Waiting On page is a view over this.
 */
export const WORK_TASK_STATUSES = ['todo', 'doing', 'waiting', 'done'] as const
export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number]

export const WORK_TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export type WorkTaskPriority = (typeof WORK_TASK_PRIORITIES)[number]

export interface IWorkTask extends Document {
    user: Types.ObjectId
    title: string
    notes?: string
    status: WorkTaskStatus
    priority: WorkTaskPriority
    project: Types.ObjectId | null
    dueDate?: string
    /** Where it came from — an email, a meeting, a Slack thread. */
    source?: string
    /** Who owes it, while `status` is 'waiting'. */
    waitingOn: Types.ObjectId | null
    /** What exactly you're waiting for, when the title doesn't say it. */
    waitingFor?: string
    /** Stamped by the server when the task enters 'waiting'; drives the age. */
    waitingSince?: string
    /** Last time you chased, so the page can say "chased 2 days ago". */
    nudgedAt?: string
    completedAt?: Date | null
    order: number
    createdAt: Date
    updatedAt: Date
}

const workTaskSchema = new Schema<IWorkTask>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 300 },
        notes: { type: String, trim: true, maxlength: 8000 },
        status: { type: String, enum: WORK_TASK_STATUSES, default: 'todo', index: true },
        priority: { type: String, enum: WORK_TASK_PRIORITIES, default: 'normal' },
        project: {
            type: Schema.Types.ObjectId,
            ref: 'WorkProject',
            default: null,
            index: true,
        },
        dueDate: { type: String, match: DATE_PATTERN },
        source: { type: String, trim: true, maxlength: 300 },
        waitingOn: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
        waitingFor: { type: String, trim: true, maxlength: 500 },
        waitingSince: { type: String, match: DATE_PATTERN },
        nudgedAt: { type: String, match: DATE_PATTERN },
        completedAt: { type: Date, default: null },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

workTaskSchema.index({ user: 1, status: 1, order: 1 })
workTaskSchema.index({ user: 1, completedAt: -1 })

export default model<IWorkTask>('WorkTask', workTaskSchema)
