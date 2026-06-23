import { Schema, model, Document, Types } from 'mongoose'

export const MM_DD_PATTERN = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export interface IBirthday extends Document {
    user: Types.ObjectId
    name: string
    date: string // MM-DD, recurs every year
    createdAt: Date
    updatedAt: Date
}

const birthdaySchema = new Schema<IBirthday>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        date: { type: String, required: true, match: MM_DD_PATTERN },
    },
    { timestamps: true }
)

export default model<IBirthday>('Birthday', birthdaySchema)
