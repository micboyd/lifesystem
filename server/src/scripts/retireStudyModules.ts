import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { connectDB } from '../config/db'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Tidy the references left behind when Studying was retired.
 *
 * Strips the 'study' pillar and course links from Life Plans, so no saved plan
 * holds a lane the app no longer knows how to draw, and unsets the study row id
 * from user settings. The old `courses` and `checklists` collections are left
 * in place, unread.
 *
 *   npm run retire:study --prefix server
 */
async function run() {
    await connectDB()
    const db = mongoose.connection.db!

    const plans = db.collection('lifeplans')
    const a = await plans.updateMany({}, { $pull: { pillars: 'study' } } as never)
    const b = await plans.updateMany(
        {},
        {
            $pull: { 'seasons.$[].intent': { pillar: 'study' } },
            $unset: { 'seasons.$[].links.courses': '' },
        } as never
    )
    const c = await db
        .collection('users')
        .updateMany({}, { $unset: { 'settings.studyRowId': '' } })
    console.log(
        `Plans: ${a.modifiedCount} pillar lists, ${b.modifiedCount} season sets cleaned; ${c.modifiedCount} users`
    )

    await mongoose.disconnect()
}

run().catch((err) => {
    console.error('Cleanup failed:', err)
    process.exit(1)
})
