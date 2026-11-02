import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'
import Meal from '../models/Meal'
import MealPlanEntry from '../models/MealPlanEntry'
import { newBatchId } from '../lib/importBatch'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * One-off (2026-11-01): the old tray recipes (platefoods, kind "box") become
 * ordinary meals now that batches are just a calculator. One tray = 5 boxes;
 * each box gets cooked rice to bring it to a meal's share of Cut 1 (720 kcal),
 * in 25 g steps. Then the un-eaten box notes on the plan point at the meal
 * that came from their tray, with its numbers.
 *
 * Dry run by default; pass --apply to write. The meals share one importBatch,
 * so the Library's "Undo last import" takes them all back out.
 */
const BOXES = 5
const AIM_KCAL = 720
const KEYS = ['calories', 'protein', 'carbs', 'fat'] as const
type Macros = Record<(typeof KEYS)[number], number>
type Ing = { name: string; grams: number; items?: number; per100: Macros }

async function run() {
    const apply = process.argv.includes('--apply')
    await connectDB()
    const db = mongoose.connection.db!
    const foods = await db.collection('platefoods').find({}).sort({ order: 1 }).toArray()
    const rice = foods.find((f) => f.kind === 'plain' && /rice/i.test(f.name))
    if (!rice?.per100) throw new Error('No rice with figures')
    const riceName = 'Rice (cooked)'

    const trays = foods.filter((f) => f.kind === 'box')
    const byUser = new Map<string, { order: number; batch: string }>()
    const made = new Map<string, mongoose.Types.ObjectId>() // tray id → meal id
    const made_ = new Map<string, { name: string; macros: Macros }>()

    for (const t of trays) {
        const user = String(t.user)
        const ings = t.ingredients as Ing[]
        const total = Object.fromEntries(
            KEYS.map((k) => [k, ings.reduce((a, i) => a + ((i.per100?.[k] ?? 0) * i.grams) / 100, 0)])
        ) as Macros
        const box = Object.fromEntries(KEYS.map((k) => [k, total[k] / BOXES])) as Macros
        const riceGrams = Math.max(0, Math.round((AIM_KCAL - box.calories) / (rice.per100.calories / 100) / 25) * 25)
        const macros = Object.fromEntries(
            KEYS.map((k) => [k, Math.round(box[k] + (rice.per100[k] * riceGrams) / 100)])
        ) as Macros
        const ingredients = [
            ...ings.map((i) => ({
                name: i.name,
                grams: Math.round(i.grams / BOXES),
                ...(i.items ? { items: Math.round((i.items / BOXES) * 10) / 10 } : {}),
            })),
            { name: riceName, grams: riceGrams },
        ]
        const notes = [`1 tray makes ${BOXES} boxes, each with ~${riceGrams} g cooked rice.`, t.notes]
            .filter(Boolean)
            .join('\n\n')
        console.log(
            `${t.name.padEnd(32)} rice ${String(riceGrams).padStart(3)} g → ${macros.calories} kcal · ${macros.protein} P · ${macros.carbs} C · ${macros.fat} F`
        )

        const existing = await Meal.findOne({ user: t.user, name: t.name })
        if (existing) {
            console.log('   already a meal — left as it is')
            made.set(String(t._id), existing._id as mongoose.Types.ObjectId)
            made_.set(String(t._id), { name: existing.name, macros: existing.macros })
            continue
        }
        if (!byUser.has(user)) {
            const last = await Meal.findOne({ user: t.user }).sort({ order: -1 })
            byUser.set(user, { order: (last?.order ?? -1) + 1, batch: newBatchId() })
        }
        const u = byUser.get(user)!
        made_.set(String(t._id), { name: t.name, macros })
        if (apply) {
            const meal = await Meal.create({
                user: t.user,
                name: t.name,
                types: ['lunch', 'dinner'],
                macros,
                ingredients,
                notes,
                order: u.order++,
                importBatch: u.batch,
            })
            made.set(String(t._id), meal._id as mongoose.Types.ObjectId)
        }
    }

    // Box notes still to eat become the tray's meal.
    const notes = await MealPlanEntry.find({ box: { $exists: true, $ne: null }, status: { $ne: 'eaten' } }).sort({
        date: 1,
    })
    console.log(`\n${notes.length} box note(s) on the plan`)
    for (const n of notes) {
        const info = made_.get(String(n.box))
        if (!info) {
            console.log(`   ${n.date} ${n.slot}: ${n.name} — no matching tray, left`)
            continue
        }
        console.log(`   ${n.date} ${n.slot.padEnd(7)} ${n.name} → ${info.name} (${info.macros.calories} kcal)`)
        if (apply) {
            await MealPlanEntry.updateOne(
                { _id: n._id },
                {
                    $set: { meal: made.get(String(n.box)), name: info.name, macros: info.macros },
                    $unset: { box: '', sides: '' },
                }
            )
        }
    }
    if (!apply) console.log('\nDry run — pass --apply to write')
    await mongoose.disconnect()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
