import path from 'path'
import dotenv from 'dotenv'
import mongoose, { Types } from 'mongoose'
import { connectDB } from '../config/db'
import Recipe from '../models/Recipe'
import FoodEntry from '../models/FoodEntry'
import Batch from '../models/Batch'
import {
    portionMacros,
    portionWeight,
    round,
    scale,
    sum,
    ZERO,
    type Cookable,
    type Ingredient,
    type Macros,
} from '../lib/recipeMath'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * One-off: moves the old nutrition data (Meal, PrepRecipe, Food, MealPlanEntry
 * with its meal / adhoc / buffet kinds) into Recipe + Batch + FoodEntry. A
 * prep recipe with a measured yield becomes a recipe plus one batch at that
 * weight; there is no stock to carry over.
 *
 * DRY RUN by default: prints every conversion and checks each day's totals come
 * out the same, then exits without writing. MIGRATE_CONFIRM=1 writes — and only
 * if every day matched. The old collections are left untouched; they are
 * dropped by a later cleanup once the new module is in use. Run
 * `npm run nutrition:backup` first.
 *
 * Refuses to run for a user who already has recipes or food entries.
 */
const confirm = process.env.MIGRATE_CONFIRM === '1'

type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const MASS: Record<string, { unit: 'g' | 'ml'; k: number }> = {
    g: { unit: 'g', k: 1 },
    kg: { unit: 'g', k: 1000 },
    ml: { unit: 'ml', k: 1 },
    l: { unit: 'ml', k: 1000 },
}

const macrosOf = (m: Raw | undefined): Macros => ({
    calories: m?.calories ?? 0,
    protein: m?.protein ?? 0,
    carbs: m?.carbs ?? 0,
    fat: m?.fat ?? 0,
})

/**
 * A library meal's free-text ingredient ("2 large Eggs", "300 g Skyr"). Mass
 * units convert; anything else becomes a count, keeping the descriptor in the
 * name when it isn't already there ("Eggs (large)").
 */
function legacyIngredient(i: Raw): Ingredient {
    const amount = Number.parseFloat(String(i.quantity ?? '').replace(',', '.'))
    const unitText = String(i.unit ?? '').trim()
    const mass = MASS[unitText.toLowerCase()]
    const hasAmount = Number.isFinite(amount) && amount > 0
    if (mass) {
        return { name: i.name, unit: mass.unit, amount: hasAmount ? amount * mass.k : undefined }
    }
    const redundant = !unitText || i.name.toLowerCase().includes(unitText.toLowerCase())
    return {
        name: redundant ? i.name : `${i.name} (${unitText})`,
        unit: 'item',
        amount: hasAmount ? amount : undefined,
    }
}

/** A prep-recipe ingredient, which already carries label macros. */
function prepIngredient(i: Raw): Ingredient {
    const n = i.nutrition ?? {}
    const per100 = macrosOf(n.per100)
    const mass = MASS[i.unit]
    if (mass) {
        return { name: i.name, unit: mass.unit, amount: i.quantity * mass.k, per: per100 }
    }
    // Counted items: per item = per100 × grams per item / 100.
    const perItem = n.unitGrams ? scale(per100, n.unitGrams / 100) : undefined
    return { name: i.name, unit: 'item', amount: i.quantity, per: perItem }
}

async function migrate() {
    await connectDB()
    const db = mongoose.connection.db
    if (!db) throw new Error('No database handle')
    const col = (name: string) => db.collection(name)

    const users = new Set<string>()
    for (const name of ['meals', 'preprecipes', 'foods', 'mealplanentries']) {
        for (const id of await col(name).distinct('user')) users.add(String(id))
    }

    let allMatch = true
    const recipesToWrite: Raw[] = []
    const batchesToWrite: Raw[] = []
    const entriesToWrite: Raw[] = []

    for (const userId of users) {
        const user = new Types.ObjectId(userId)
        const existing =
            (await Recipe.countDocuments({ user })) +
            (await Batch.countDocuments({ user })) +
            (await FoodEntry.countDocuments({ user }))
        if (existing > 0) {
            console.log(`User ${userId}: already has ${existing} new record(s) — skipping.`)
            continue
        }
        console.log(`\n=== User ${userId} ===`)

        // Old id → new recipe, so entries can be repointed.
        const byMeal = new Map<string, Raw>()
        const byPrep = new Map<string, Raw>()
        const byFood = new Map<string, Raw>()
        let order = 0

        console.log('\nRecipes from the meal library (by the portion, typed macros):')
        for (const m of await col('meals').find({ user }).sort({ order: 1 }).toArray()) {
            const r = {
                _id: new Types.ObjectId(),
                user,
                name: m.name,
                types: m.types ?? [],
                ingredients: (m.ingredients ?? []).map(legacyIngredient),
                macros: macrosOf(m.macros),
                servings: m.servings || 1,
                method: m.method ?? [],
                notes: m.notes,
                link: m.link,
                order: order++,
                archived: false,
            }
            byMeal.set(String(m._id), r)
            recipesToWrite.push(r)
            const ings = r.ingredients
                .map((i: Ingredient) => `${i.amount ?? '?'}${i.unit === 'item' ? '×' : i.unit} ${i.name}`)
                .join(', ')
            console.log(`  ${r.name} — ${r.macros.calories} kcal/portion — ${ings}`)
        }

        console.log('\nRecipes (and batches) from meal prep, built from ingredients:')
        for (const p of await col('preprecipes').find({ user }).toArray()) {
            const ingredients = (p.ingredients ?? []).map(prepIngredient)
            const estimate = p.estimatedYieldGrams ?? p.lastYieldGrams
            const servings =
                estimate && p.usualPortionGrams ? Math.max(1, Math.round(estimate / p.usualPortionGrams)) : 1
            const r = {
                _id: new Types.ObjectId(),
                user,
                name: p.name,
                types: ['lunch', 'dinner'],
                ingredients,
                servings,
                estimatedCookedGrams: estimate,
                method: p.instructions ? String(p.instructions).split(/\n+/).filter(Boolean) : [],
                order: order++,
                archived: !!p.archived,
            }
            byPrep.set(String(p._id), r)
            recipesToWrite.push(r)
            const per = portionMacros(r, 1)
            console.log(
                `  ${r.name}${r.archived ? ' [archived]' : ''} — ${servings} portion(s), ${per.calories} kcal / ${per.protein} g protein each — est. cooked ${estimate ?? '—'} g`
            )
            if (p.lastYieldGrams) {
                const b = {
                    _id: new Types.ObjectId(),
                    user,
                    recipe: r._id,
                    name: r.name,
                    cookedOn: p.lastYieldDate ?? new Date(p.updatedAt).toISOString().slice(0, 10),
                    ingredients,
                    servings,
                    cookedGrams: p.lastYieldGrams,
                    archived: !!p.archived,
                }
                batchesToWrite.push(b)
                const w = portionWeight(b)!
                console.log(`    batch ${b.cookedOn}: weighed ${b.cookedGrams} g → ${Math.round(w.grams)} g a portion`)
            }
        }

        const foods = await col('foods').find({ user }).toArray()
        if (foods.length) console.log('\nRecipes from saved food labels (per 100 g):')
        for (const f of foods) {
            const unit = f.basis === 'ml' ? 'ml' : 'g'
            const r = {
                _id: new Types.ObjectId(),
                user,
                name: f.brand ? `${f.name} (${f.brand})` : f.name,
                types: [],
                ingredients: [{ name: f.name, unit, amount: 100, per: macrosOf(f.per100) }],
                servings: 1,
                cookedGrams: 100,
                method: [],
                order: order++,
                archived: !!f.archived,
            }
            byFood.set(String(f._id), r)
            recipesToWrite.push(r)
            console.log(`  ${r.name}`)
        }

        // ── Entries ──────────────────────────────────────────────────────────
        const oldTotals = new Map<string, Macros>()
        const newTotals = new Map<string, Macros>()
        const bump = (map: Map<string, Macros>, date: string, m: Macros) =>
            map.set(date, sum([map.get(date) ?? ZERO, m]))

        const entries = await col('mealplanentries').find({ user }).sort({ date: 1 }).toArray()
        const mealDocs = new Map(
            (await col('meals').find({ user }).toArray()).map((m) => [String(m._id), m])
        )
        const kinds = { meal: 0, adhoc: 0, buffet: 0, orphan: 0 }

        for (const e of entries) {
            const base = {
                user,
                date: e.date,
                slot: e.slot,
                status: e.status ?? 'planned',
                order: e.order ?? 0,
            }
            const servings = e.servings ?? 1

            if (e.meal) {
                const old = mealDocs.get(String(e.meal))
                const r = byMeal.get(String(e.meal))
                if (!old || !r) {
                    kinds.orphan++
                    continue // the old API hid these too
                }
                kinds.meal++
                bump(oldTotals, e.date, scale(macrosOf(old.macros), servings))
                const macros = portionMacros(r as Cookable, servings)
                bump(newTotals, e.date, macros)
                entriesToWrite.push({ ...base, recipe: r._id, name: r.name, amount: servings, unit: 'portion', macros })
            } else if (e.adhoc) {
                kinds.adhoc++
                const m = scale(macrosOf(e.adhoc.macros), servings)
                bump(oldTotals, e.date, m)
                bump(newTotals, e.date, round(m))
                entriesToWrite.push({ ...base, name: e.adhoc.name, amount: 1, unit: 'portion', macros: round(m) })
            } else if (e.buffet) {
                kinds.buffet++
                // One line per component, frozen at the macros it was logged with.
                for (const c of e.buffet.components ?? []) {
                    const m = macrosOf(c.macros)
                    bump(oldTotals, e.date, m)
                    bump(newTotals, e.date, round(m))
                    const r =
                        (c.recipe && byPrep.get(String(c.recipe))) ||
                        (c.food && byFood.get(String(c.food))) ||
                        undefined
                    const grams = c.grams ?? c.plannedGrams ?? 0
                    entriesToWrite.push({
                        ...base,
                        recipe: r?._id,
                        name: c.name,
                        amount: r ? grams : 1,
                        unit: r ? 'g' : 'portion',
                        macros: round(m),
                    })
                }
            }
        }

        console.log(
            `\nEntries: ${kinds.meal} meal, ${kinds.adhoc} off-plan, ${kinds.buffet} buffet plate(s), ${kinds.orphan} pointing at a deleted meal (dropped)`
        )

        // ── Day totals must match (within rounding) ──────────────────────────
        console.log('\nDay totals, old → new (kcal / protein / carbs / fat):')
        const fmt = (m: Macros) =>
            `${Math.round(m.calories)} / ${m.protein.toFixed(1)} / ${m.carbs.toFixed(1)} / ${m.fat.toFixed(1)}`
        for (const date of [...oldTotals.keys()].sort()) {
            const a = oldTotals.get(date)!
            const b = newTotals.get(date) ?? ZERO
            const ok =
                Math.abs(a.calories - b.calories) <= 1 &&
                Math.abs(a.protein - b.protein) <= 0.5 &&
                Math.abs(a.carbs - b.carbs) <= 0.5 &&
                Math.abs(a.fat - b.fat) <= 0.5
            if (!ok) allMatch = false
            console.log(`  ${date}  ${fmt(a).padEnd(28)} → ${fmt(b).padEnd(28)} ${ok ? '✓' : '✗ MISMATCH'}`)
        }
    }

    console.log(
        `\n${recipesToWrite.length} recipe(s), ${batchesToWrite.length} batch(es), ${entriesToWrite.length} food entr(ies) to write.`
    )

    if (!allMatch) {
        console.log('Some day totals differ — nothing written.')
    } else if (!confirm) {
        console.log('Dry run — nothing written. Re-run with MIGRATE_CONFIRM=1 to write.')
    } else {
        await Recipe.insertMany(recipesToWrite)
        await Batch.insertMany(batchesToWrite)
        await FoodEntry.insertMany(entriesToWrite)
        console.log('Written.')
    }

    await mongoose.disconnect()
}

migrate().catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
})
