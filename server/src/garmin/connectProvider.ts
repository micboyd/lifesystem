/**
 * The python-garminconnect provider. Holds one user's tokens for the length of
 * a request: each call hands them to the worker, and any refreshed tokens it
 * returns go to `onTokens` to be saved, encrypted.
 */
import { toGarminWorkout } from './connectWorkout'
import { runWorker, type WorkerRun } from './pythonWorker'
import type { ActivityBrief, ActivityDetail, GarminWorkoutProvider, WorkoutSpec } from './provider'

export class ConnectProvider implements GarminWorkoutProvider {
    constructor(
        private tokens: string,
        private readonly onTokens: (tokens: string) => Promise<void>,
        private readonly run: WorkerRun = runWorker
    ) {}

    private async call<T>(op: string, fields: Record<string, unknown> = {}): Promise<T> {
        const reply = await this.run<T>({ op, tokens: this.tokens, ...fields })
        if (reply.tokens && reply.tokens !== this.tokens) {
            this.tokens = reply.tokens
            await this.onTokens(reply.tokens)
        }
        return reply.result
    }

    private body(w: WorkoutSpec) {
        return toGarminWorkout(w.name, w.steps, w.estimatedSeconds)
    }

    createWorkout(workout: WorkoutSpec) {
        return this.call<{ workoutId: string }>('create', { workout: this.body(workout) })
    }

    async updateWorkout(workoutId: string, workout: WorkoutSpec) {
        await this.call('update', { workoutId, workout: this.body(workout) })
    }

    scheduleWorkout(workoutId: string, date: string) {
        return this.call<{ scheduleId: string }>('schedule', { workoutId, date })
    }

    async unscheduleWorkout(scheduleId: string) {
        await this.call('unschedule', { scheduleId })
    }

    sendToDevice(workoutId: string) {
        return this.call<{ deviceName?: string }>('push', { workoutId })
    }

    async listActivities(from: string, to: string) {
        return (await this.call<{ activities: ActivityBrief[] }>('list_activities', { from, to })).activities
    }

    getActivity(activityId: string) {
        return this.call<ActivityDetail>('get_activity', { activityId })
    }
}

/** Sign in. Either connected (with tokens) or waiting on an MFA code. */
export async function connectWithPassword(
    email: string,
    password: string,
    run: WorkerRun = runWorker
): Promise<
    | { status: 'connected'; tokens: string; displayName?: string }
    | { status: 'needs_mfa'; mfaState: string }
> {
    const reply = await run<{ status: string; displayName?: string; mfaState?: string }>({
        op: 'login',
        email,
        password,
    })
    if (reply.result.status === 'needs_mfa' && reply.result.mfaState)
        return { status: 'needs_mfa', mfaState: reply.result.mfaState }
    return { status: 'connected', tokens: reply.tokens ?? '', displayName: reply.result.displayName }
}

/** Finish a sign-in with the code Garmin sent. */
export async function connectWithMfa(
    mfaState: string,
    code: string,
    run: WorkerRun = runWorker
): Promise<{ tokens: string; displayName?: string }> {
    const reply = await run<{ displayName?: string }>({ op: 'resume_mfa', mfaState, code })
    return { tokens: reply.tokens ?? '', displayName: reply.result.displayName }
}
