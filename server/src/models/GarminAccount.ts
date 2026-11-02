import { Schema, model, Document, Types } from 'mongoose'

/**
 * A user's link to their Garmin Connect account. The password is never stored:
 * only the session tokens Garmin issues, encrypted (garmin/crypto.ts). While an
 * MFA code is awaited, the half-finished sign-in is held here encrypted too,
 * for ten minutes.
 */
export interface IGarminAccount extends Document {
    user: Types.ObjectId
    /** Encrypted token JSON; empty while waiting on MFA. */
    tokens: string
    /** "expired" once Garmin rejects the tokens — the UI asks to reconnect. */
    status: 'connected' | 'expired' | 'pending_mfa'
    displayName?: string
    connectedAt?: Date | null
    /** Encrypted sign-in state awaiting an MFA code, and when it lapses. */
    mfaState?: string
    mfaExpiresAt?: Date | null
    createdAt: Date
    updatedAt: Date
}

const garminAccountSchema = new Schema<IGarminAccount>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        tokens: { type: String, default: '', select: false },
        status: { type: String, enum: ['connected', 'expired', 'pending_mfa'], default: 'connected' },
        displayName: { type: String, trim: true },
        connectedAt: { type: Date, default: null },
        mfaState: { type: String, select: false },
        mfaExpiresAt: { type: Date, default: null },
    },
    { timestamps: true }
)

export default model<IGarminAccount>('GarminAccount', garminAccountSchema)
