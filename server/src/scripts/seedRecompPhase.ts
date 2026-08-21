import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { connectDB } from '../config/db'
import User from '../models/User'
import NutritionPhase from '../models/NutritionPhase'
import WeightLog from '../models/WeightLog'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Create the recomp phase, and the weigh-in it starts from.
 *
 * A goal-aware phase needs two things to be worth anything: the goal itself, and
 * a starting weight the trend can be measured against. The phase carries the
 * first; the second has to be a real weigh-in, because `startWeightKg` is only
 * the baseline for "change so far" — every rate, projection and recommendation
 * is read off the WeightLog series.
 *
 * Idempotent: run it twice and it updates the phase in place rather than
 * stacking a second one over the same nine months, which would resolve by
 * latest-start-wins and silently shadow the first.
 *
 *   RECOMP_EMAIL=you@example.com npm run nutrition:seed-recomp --prefix server
 */

const EMAIL = process.env.RECOMP_EMAIL ?? 'michael_boyd@live.co.uk'

const START = '2026-08-21'
const END = '2027-05-31'

/** Starting measurements, from the smart scale on the morning of the start date. */
const START_WEIGHT_KG = 103
const START_BODY_FAT_PCT = 28.8

/**
 * The opening prescription: 2,950 kcal at 210 g protein and 90 g fat, with carbs
 * taking the rest. 210 × 4 + 90 × 9 + 325 × 4 = 2,950, so it reconciles exactly.
 */
const TARGETS = { calories: 2950, protein: 210, carbs: 325, fat: 90 }

async function seed() {
    await connectDB()

    const user = await User.findOne({ email: EMAIL })
    if (!user) {
        console.error(`No user found for ${EMAIL}. Set RECOMP_EMAIL to the right address.`)
        await mongoose.disconnect()
        process.exit(1)
    }

    const phase = await NutritionPhase.findOneAndUpdate(
        { user: user._id, name: 'Recomp to 20%' },
        {
            $set: {
                startDate: START,
                endDate: END,
                // Still a cut — the scale goes down and every cut/gain verdict
                // downstream keeps its existing meaning. That the point is body
                // composition is said by goal.style, not by a fourth phase kind.
                kind: 'cut',
                targets: TARGETS,
                weeklyRate: -0.2,
                goal: {
                    style: 'recomp',
                    startWeightKg: START_WEIGHT_KG,
                    targetDate: END,
                    targetWeightKg: 95,
                    targetWeightRangeKg: { min: 94, max: 96 },
                    targetBodyFatPct: 20,
                    targetBodyFatRangePct: { min: 19.5, max: 21 },
                    targetWeeklyRateKg: -0.2,
                    // Signed, so min is the faster end of the band.
                    acceptableWeeklyRateKg: { min: -0.3, max: -0.15 },
                    proteinFloorG: 210,
                    adaptive: true,
                },
                notes: 'Slow recomp: hold protein at 210 g, adjust carbs, keep training hard.',
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    // The starting weigh-in. Left alone if one already exists for the day — a
    // real reading beats a seeded one.
    const existing = await WeightLog.findOne({ user: user._id, date: START })
    if (existing) {
        console.log(`Weigh-in for ${START} already recorded (${existing.weight} kg) — left alone.`)
    } else {
        await WeightLog.create({
            user: user._id,
            date: START,
            weight: START_WEIGHT_KG,
            bodyFat: START_BODY_FAT_PCT,
            notes: 'Recomp starting measurements.',
        })
        console.log(`Recorded starting weigh-in: ${START_WEIGHT_KG} kg at ${START_BODY_FAT_PCT}%.`)
    }

    const fatMass = (START_WEIGHT_KG * START_BODY_FAT_PCT) / 100
    console.log(`\n  ${phase.name}  (${phase.startDate} → ${phase.endDate})`)
    console.log(`  Target:  ${TARGETS.calories} kcal · ${TARGETS.protein}g P · ${TARGETS.carbs}g C · ${TARGETS.fat}g F`)
    console.log(`  Goal:    95 kg (94–96) at ~20% body fat by ${END}`)
    console.log(`  Rate:    −0.20 kg/week, acceptable −0.30 to −0.15`)
    console.log(`  Start:   ${START_WEIGHT_KG} kg · ${fatMass.toFixed(1)} kg fat · ${(START_WEIGHT_KG - fatMass).toFixed(1)} kg lean\n`)
    console.log('  Adaptive review needs ~21 logged days before it will propose anything.\n')

    await mongoose.disconnect()
}

seed().catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
})
