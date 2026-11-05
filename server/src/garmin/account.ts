/**
 * A user's Garmin connection: signing in (with MFA), keeping the tokens
 * encrypted, handing out a provider for their account, and noticing when
 * Garmin stops accepting the tokens so the UI can ask to reconnect.
 */
import GarminAccount from '../models/GarminAccount'
import GarminWorkout from '../models/GarminWorkout'
import FitnessPlanEntry, { setGarminDeleteListener, type IPlanEntryGarmin } from '../models/FitnessPlanEntry'
import { decrypt, encrypt, encryptionConfigured } from './crypto'
import { ConnectProvider, connectWithMfa, connectWithPassword } from './connectProvider'
import { GarminError, isGarminError, type GarminWorkoutProvider } from './provider'
import type { SyncStore } from './sync'

const MFA_WINDOW_MS = 10 * 60 * 1000

export interface GarminStatus {
    /** Whether the server has an encryption key — without one nothing can be stored. */
    configured: boolean
    status: 'not_connected' | 'connected' | 'expired' | 'pending_mfa'
    displayName?: string
    connectedAt?: Date | null
}

export async function garminStatus(userId: string): Promise<GarminStatus> {
    const configured = encryptionConfigured()
    const account = await GarminAccount.findOne({ user: userId })
    if (!account) return { configured, status: 'not_connected' }
    const mfaLapsed =
        account.status === 'pending_mfa' && (!account.mfaExpiresAt || account.mfaExpiresAt < new Date())
    if (mfaLapsed) return { configured, status: 'not_connected' }
    return {
        configured,
        status: account.status,
        displayName: account.displayName,
        connectedAt: account.connectedAt,
    }
}

async function saveConnected(userId: string, tokens: string, displayName?: string) {
    if (!tokens) throw new GarminError('error')
    await GarminAccount.findOneAndUpdate(
        { user: userId },
        {
            $set: {
                tokens: encrypt(tokens),
                status: 'connected',
                displayName,
                connectedAt: new Date(),
                mfaExpiresAt: null,
            },
            $unset: { mfaState: 1 },
        },
        { upsert: true }
    )
}

/** Sign in with email and password. The password is used once and never stored. */
export async function connectGarmin(
    userId: string,
    email: string,
    password: string
): Promise<'connected' | 'needs_mfa'> {
    if (!encryptionConfigured()) throw new GarminError('not_configured')
    const result = await connectWithPassword(email, password)
    if (result.status === 'needs_mfa') {
        await GarminAccount.findOneAndUpdate(
            { user: userId },
            {
                $set: {
                    status: 'pending_mfa',
                    mfaState: encrypt(result.mfaState),
                    mfaExpiresAt: new Date(Date.now() + MFA_WINDOW_MS),
                },
                $setOnInsert: { tokens: '' },
            },
            { upsert: true }
        )
        return 'needs_mfa'
    }
    await saveConnected(userId, result.tokens, result.displayName)
    return 'connected'
}

/** Finish a sign-in that's waiting on the code Garmin sent. */
export async function submitGarminMfa(userId: string, code: string): Promise<void> {
    const account = await GarminAccount.findOne({ user: userId }).select('+mfaState')
    if (
        !account ||
        account.status !== 'pending_mfa' ||
        !account.mfaState ||
        !account.mfaExpiresAt ||
        account.mfaExpiresAt < new Date()
    )
        throw new GarminError('not_connected')
    const { tokens, displayName } = await connectWithMfa(decrypt(account.mfaState), code)
    await saveConnected(userId, tokens, displayName)
}

/**
 * Forget the account. Garmin has no way to revoke these tokens, so deleting our
 * only copy is what disconnects. Workouts already sent stay on Garmin.
 */
export async function disconnectGarmin(userId: string): Promise<void> {
    await GarminAccount.deleteOne({ user: userId })
}

async function markExpired(userId: string) {
    await GarminAccount.updateOne({ user: userId }, { $set: { status: 'expired' } })
}

/**
 * Every provider call, with a rejected session recorded on the account — so the
 * next screen to ask shows "Reconnect" rather than failing call after call.
 */
function watchExpiry(provider: GarminWorkoutProvider, userId: string): GarminWorkoutProvider {
    const guard =
        <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
        async (...args: A): Promise<R> => {
            try {
                return await fn(...args)
            } catch (err) {
                if (isGarminError(err, 'session_expired')) await markExpired(userId)
                throw err
            }
        }
    return {
        createWorkout: guard(provider.createWorkout.bind(provider)),
        updateWorkout: guard(provider.updateWorkout.bind(provider)),
        scheduleWorkout: guard(provider.scheduleWorkout.bind(provider)),
        unscheduleWorkout: guard(provider.unscheduleWorkout.bind(provider)),
        sendToDevice: guard(provider.sendToDevice.bind(provider)),
        listActivities: guard(provider.listActivities.bind(provider)),
        getActivity: guard(provider.getActivity.bind(provider)),
        dailyCalories: guard(provider.dailyCalories.bind(provider)),
    }
}

/** A provider for the user's account, or why there can't be one. */
export async function providerFor(userId: string): Promise<GarminWorkoutProvider> {
    if (!encryptionConfigured()) throw new GarminError('not_configured')
    const account = await GarminAccount.findOne({ user: userId }).select('+tokens')
    if (!account || account.status === 'pending_mfa' || !account.tokens) throw new GarminError('not_connected')
    if (account.status === 'expired') throw new GarminError('session_expired')
    let tokens: string
    try {
        tokens = decrypt(account.tokens)
    } catch (err) {
        if (isGarminError(err, 'session_expired')) await markExpired(userId)
        throw err
    }
    const provider = new ConnectProvider(tokens, async (fresh) => {
        await GarminAccount.updateOne({ user: userId }, { $set: { tokens: encrypt(fresh) } })
    })
    return watchExpiry(provider, userId)
}

/** The sync store over Mongo, scoped to one user. */
export function mongoSyncStore(userId: string): SyncStore {
    return {
        async getWorkout(sessionId) {
            const w = await GarminWorkout.findOne({ user: userId, session: sessionId }).lean()
            return w ? { workoutId: w.workoutId, stepsHash: w.stepsHash } : null
        },
        async saveWorkout(sessionId, workoutId, stepsHash) {
            await GarminWorkout.findOneAndUpdate(
                { user: userId, session: sessionId },
                { $set: { workoutId, stepsHash } },
                { upsert: true }
            )
        },
        async saveEntry(entryId, garmin: IPlanEntryGarmin) {
            await FitnessPlanEntry.updateOne({ _id: entryId, user: userId }, { $set: { garmin } })
        },
        async markWorkoutEntries(workoutId, stepsHash) {
            await FitnessPlanEntry.updateMany(
                { user: userId, 'garmin.workoutId': workoutId },
                { $set: { 'garmin.stepsHash': stepsHash } }
            )
        },
    }
}

/**
 * Take deleted planner entries off the Garmin calendar too. Runs after the
 * delete has gone through and never holds it up; a failure is logged by code
 * only, and leaves a stray day on Garmin to delete there.
 */
export function registerGarminCleanup() {
    setGarminDeleteListener((entries) => {
        const byUser = new Map<string, string[]>()
        for (const e of entries) byUser.set(e.user, [...(byUser.get(e.user) ?? []), e.scheduleId])
        for (const [userId, scheduleIds] of byUser) {
            void (async () => {
                try {
                    const provider = await providerFor(userId)
                    for (const id of scheduleIds) await provider.unscheduleWorkout(id)
                } catch (err) {
                    const code = isGarminError(err) ? err.code : 'error'
                    console.warn(`Garmin: could not remove ${scheduleIds.length} calendar placement(s) (${code})`)
                }
            })()
        }
    })
}
