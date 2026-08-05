import User from '../models/User'
import ConditioningSession from '../models/ConditioningSession'
import { connectDB } from '../config/db'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

// Deletes conditioning sessions that BOTH share a name with another session
// AND carry the new interval "rep steps" (a part with `rounds` set). This
// clears out duplicate rep-enabled sessions that a re-import left behind, while
// leaving the plain (non-rep) originals of the same name untouched.
//
// Whose library to clean. Defaults to the seeded test user; override with
// DEDUPE_EMAIL. Set DEDUPE_ALL_USERS=1 to run across every user instead — a
// deliberately separate, louder flag. Duplicate-name matching is always scoped
// within a single user, so one user's names never collide with another's.
//
// Runs as a DRY RUN by default: it prints exactly what it would delete and
// changes nothing. Set DEDUPE_CONFIRM=1 to actually delete.
const email = process.env.DEDUPE_EMAIL ?? 'michael_boyd@live.co.uk'
const allUsers = process.env.DEDUPE_ALL_USERS === '1'
const confirm = process.env.DEDUPE_CONFIRM === '1'

// A session "has rep steps" if any of its parts has a rounds count.
function hasRepSteps(session: { parts: { rounds?: number }[] }): boolean {
    return session.parts.some((p) => typeof p.rounds === 'number' && p.rounds > 0)
}

async function dedupeConditioningReps() {
    await connectDB()

    // Gather the users we're operating on so name-matching stays per-user.
    let users: { _id: mongoose.Types.ObjectId; email: string }[]
    if (allUsers) {
        users = await User.find({}, { email: 1 }).lean()
        console.log(`Scanning conditioning libraries for ALL users (${users.length})…`)
    } else {
        const user = await User.findOne({ email }, { email: 1 }).lean()
        if (!user) {
            console.error(`No user found with email: ${email}`)
            await mongoose.disconnect()
            process.exit(1)
        }
        users = [user]
        console.log(`Scanning conditioning library for ${email}…`)
    }

    const toDelete: mongoose.Types.ObjectId[] = []

    for (const user of users) {
        const sessions = await ConditioningSession.find(
            { user: user._id },
            { name: 1, parts: 1 }
        ).lean()

        // Count how many sessions share each name (within this user).
        const nameCounts = new Map<string, number>()
        for (const s of sessions) {
            nameCounts.set(s.name, (nameCounts.get(s.name) ?? 0) + 1)
        }

        for (const s of sessions) {
            const isDuplicateName = (nameCounts.get(s.name) ?? 0) > 1
            if (isDuplicateName && hasRepSteps(s)) {
                toDelete.push(s._id)
                console.log(
                    `  ${confirm ? 'DELETE' : 'WOULD DELETE'}: "${s.name}" (${s._id})`
                )
            }
        }
    }

    if (toDelete.length === 0) {
        console.log('No matching sessions found — nothing to do.')
        await mongoose.disconnect()
        return
    }

    if (!confirm) {
        console.log(
            `\nDRY RUN: ${toDelete.length} session(s) match. ` +
                'Re-run with DEDUPE_CONFIRM=1 to delete them.'
        )
        await mongoose.disconnect()
        return
    }

    const res = await ConditioningSession.deleteMany({ _id: { $in: toDelete } })
    console.log(`\nDeleted ${res.deletedCount} conditioning session(s).`)

    await mongoose.disconnect()
}

dedupeConditioningReps().catch((err) => {
    console.error('Dedupe failed:', err)
    process.exit(1)
})
