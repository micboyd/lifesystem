import { Schema, model, Document } from 'mongoose'

/**
 * A daily call counter per outside service, e.g. { service: 'ors', day:
 * '2026-11-02', count: 37 }. Kept in Mongo rather than memory because the
 * dyno restarts daily and the quota doesn't.
 */
export interface IApiUsage extends Document {
    service: string
    day: string
    count: number
}

const apiUsageSchema = new Schema<IApiUsage>({
    service: { type: String, required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
})

apiUsageSchema.index({ service: 1, day: 1 }, { unique: true })

export default model<IApiUsage>('ApiUsage', apiUsageSchema)
