import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'
import User from '../models/User'
import { providerFor } from '../garmin/account'
import { isGarminError } from '../garmin/provider'
import type { WatchStep } from '../lib/watchSteps'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Sends one small test workout to your real Garmin account, through the same
 * provider the app uses: creates it, puts it on today's Garmin calendar and
 * pushes it to the watch you last synced. Connect Garmin in the app (Profile →
 * Garmin) first — this uses those saved tokens and never asks for a password.
 *
 *   npm run garmin:send-test --prefix server
 *
 * GARMIN_TEST_EMAIL  whose account to use (defaults to the seeded user).
 * GARMIN_TEST_DATE   the day to schedule it (defaults to today).
 *
 * Delete "AdminLife test workout" in Garmin Connect afterwards.
 */
const email = process.env.GARMIN_TEST_EMAIL ?? 'michael_boyd@live.co.uk'
const date = process.env.GARMIN_TEST_DATE ?? new Date().toISOString().slice(0, 10)

const steps: WatchStep[] = [
    { type: 'warmup', label: 'Walk 2 min', end: { kind: 'time', seconds: 120 } },
    {
        type: 'repeat',
        times: 2,
        steps: [
            {
                type: 'run',
                label: 'Run 400 m',
                end: { kind: 'distance', metres: 400 },
                paceTarget: { fastestSecPerKm: 480, slowestSecPerKm: 540 },
            },
            { type: 'walk', label: 'Walk 150 m', end: { kind: 'distance', metres: 150 } },
        ],
    },
    { type: 'cooldown', label: 'Calf raises', end: { kind: 'lapButton' } },
]

async function main() {
    await connectDB()
    const user = await User.findOne({ email }).select('_id')
    if (!user) throw new Error(`No user with email ${email}`)
    const provider = await providerFor(String(user._id))

    const { workoutId } = await provider.createWorkout({
        name: 'AdminLife test workout',
        steps,
        estimatedSeconds: 900,
    })
    console.log(`Created workout ${workoutId}`)
    const { scheduleId } = await provider.scheduleWorkout(workoutId, date)
    console.log(`Scheduled on ${date} (schedule ${scheduleId})`)
    try {
        const { deviceName } = await provider.sendToDevice(workoutId)
        console.log(`Pushed to ${deviceName ?? 'your watch'}`)
    } catch (err) {
        console.log(`Push failed (${isGarminError(err) ? err.code : 'error'}) — scheduled, so sync the watch in Garmin Connect.`)
    }
}

main()
    .catch((err) => {
        console.error(isGarminError(err) ? `Failed: ${err.code} — ${err.message}` : `Failed: ${err instanceof Error ? err.message : 'unknown error'}`)
        process.exitCode = 1
    })
    .finally(() => mongoose.disconnect())
