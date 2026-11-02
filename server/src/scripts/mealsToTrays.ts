import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'
import Meal from '../models/Meal'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * One-off (2026-11-01), after traysToMeals: those meals become trays of 5.
 * A tray's ingredients are the whole tray's, so each takes its tray recipe's
 * amounts as written (no rounding a fifth of 2 g oregano down to 0) plus five
 * boxes' worth of the rice it was given. Macros stay one box's.
 *
 * Dry run by default; pass --apply to write.
 */
const BOXES = 5

async function run() {
    const apply = process.argv.includes('--apply')
    await connectDB()
    const trays = await mongoose.connection.db!.collection('platefoods').find({ kind: 'box' }).toArray()
    for (const t of trays) {
        const meal = await Meal.findOne({ user: t.user, name: t.name })
        if (!meal) {
            console.log(`${t.name}: no meal, skipped`)
            continue
        }
        const rice = meal.ingredients.find((i) => /^rice/i.test(i.name))
        const ingredients = [
            ...(t.ingredients as { name: string; grams: number; items?: number }[]).map((i) => ({
                name: i.name,
                grams: i.grams,
                ...(i.items ? { items: i.items } : {}),
            })),
            ...(rice ? [{ name: rice.name, grams: rice.grams * BOXES }] : []),
        ]
        console.log(`${t.name.padEnd(32)} ${meal.batchOf ? `already a tray of ${meal.batchOf}` : `→ tray of ${BOXES}`}, ${ingredients.length} ingredients, rice ${rice ? rice.grams * BOXES : 0} g`)
        if (apply) await Meal.updateOne({ _id: meal._id }, { $set: { batchOf: BOXES, ingredients } })
    }
    if (!apply) console.log('\nDry run — pass --apply to write')
    await mongoose.disconnect()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
