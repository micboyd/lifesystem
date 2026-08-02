import User from '../models/User'
import Meal from '../models/Meal'
import MealPlanEntry from '../models/MealPlanEntry'
import { connectDB } from '../config/db'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

// Whose library to clear. Defaults to the seeded test user; override with
// CLEAR_EMAIL. Set CLEAR_ALL_USERS=1 to wipe every user's meals instead — a
// deliberately separate, louder flag so a stray run can't nuke everyone.
const email = process.env.CLEAR_EMAIL ?? 'katy-mcdonald@sky.com'
const allUsers = process.env.CLEAR_ALL_USERS === '1'

async function clearMeals() {
    await connectDB()

    // Scope every delete to one user unless CLEAR_ALL_USERS is set.
    let scope: Record<string, unknown> = {}
    if (!allUsers) {
        const user = await User.findOne({ email })
        if (!user) {
            console.error(`No user found with email: ${email}`)
            await mongoose.disconnect()
            process.exit(1)
        }
        scope = { user: user._id }
        console.log(`Clearing meal library for ${email}…`)
    } else {
        console.log('Clearing meal library for ALL users…')
    }

    // Plan entries reference meals by id, so drop them too — otherwise the
    // planner is left with entries pointing at meals that no longer exist.
    const meals = await Meal.deleteMany(scope)
    const entries = await MealPlanEntry.deleteMany(scope)

    console.log(`Deleted ${meals.deletedCount} meal(s) and ${entries.deletedCount} plan entry/entries.`)

    await mongoose.disconnect()
}

clearMeals().catch((err) => {
    console.error('Clear failed:', err)
    process.exit(1)
})
