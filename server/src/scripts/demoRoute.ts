/**
 * Manual check against the real openrouteservice: one press of "Generate
 * route" for a 3.6 km loop (Outdoor Run-Walk 1), printed rather than saved.
 * Uses up to 5 of the day's routing calls and doesn't touch the database.
 *
 *   ORS_API_KEY=… npm run route:demo --prefix server -- 51.5072 -0.1276
 *
 * Arguments are the start's latitude and longitude (defaults to central London).
 */
import dotenv from 'dotenv'
import path from 'path'
import { generateRoute } from '../lib/routeGenerate'
import { roundTrip, oneWay } from '../lib/openroute'
import { toleranceM } from '../lib/routeSelect'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

async function main() {
    const [latArg, lngArg, kindArg] = process.argv.slice(2)
    const start = { lat: Number(latArg ?? 51.5072), lng: Number(lngArg ?? -0.1276) }
    const kind = kindArg === 'outback' ? 'outback' : 'loop'
    const targetM = 3600
    if (!process.env.ORS_API_KEY) throw new Error('Set ORS_API_KEY in .env first.')

    console.log(`Generating a ${targetM} m ${kind} from ${start.lat}, ${start.lng} (tolerance ±${toleranceM(targetM)} m)…`)
    const t0 = Date.now()
    const out = await generateRoute({
        start,
        targetM,
        kind,
        used: new Set(),
        seen: [],
        bad: [],
        client: { roundTrip, oneWay },
    })
    console.log(`${out.calls} routing calls in ${Date.now() - t0} ms`)
    if (!out.route) {
        console.log('No route returned.')
        return
    }
    const r = out.route
    console.log(
        JSON.stringify(
            {
                pick: out.pick.kind,
                distanceM: r.distanceM,
                diffM: r.distanceM - targetM,
                ascentM: r.ascentM,
                descentM: r.descentM,
                repeatedShare: Number(r.repeatedShare.toFixed(3)),
                seed: r.seed,
                points: r.points,
                coordinates: r.coords.length,
                hasElevation: r.coords.every((c) => c.length === 3),
                first: r.coords[0],
                last: r.coords[r.coords.length - 1],
            },
            null,
            2
        )
    )
}

main().catch((err) => {
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err)
    process.exit(1)
})
