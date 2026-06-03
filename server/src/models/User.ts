import { Schema, model, Document } from 'mongoose'

export interface IUser extends Document {
    name: string
    email: string
    password: string
    createdAt: Date
}

const userSchema = new Schema<IUser>(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        password: { type: String, required: true },
    },
    { timestamps: true }
)

export default model<IUser>('User', userSchema)
