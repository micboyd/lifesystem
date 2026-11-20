import { ISessionPart } from '../models/ConditioningSession'
import { readWindow } from './timeWindow'
import { readSteps } from './steps'
import { legacyReps, readReps, repLine, repSeconds } from './sessionReps'

/**
 * Normalise the `parts` array of an imported conditioning session, dropping
 * entries without a name.
 *
 * Shared by the conditioning importer and the training-plan importer: both read
 * the same session shape, and a part carries more than it looks like it does —
 * `rounds` turns it into a tap-to-count block, and `roundSeconds` plus
 * `startAtSec` are what put a running clock on each rep, and `startMin`/
 * `endMin` are the part's planned slot in the session, and `steps` is its
 * tick-off sub-list. Anything that
 * normalises parts must carry all of them, so there is only one copy of this.
 *
 * `reps` is the one structure the templates now ask for (lib/sessionReps.ts).
 * When a part has reps, the counter fields are worked out from them — `rounds`
 * is how many, `roundDetails` one line each, `roundSeconds` when every rep is
 * timed — so the counter, logs, exports and watch keep reading what they did.
 * A part written the older way (`rounds` + `roundDetails`, or a `steps` list)
 * gets its reps from those, so every section reads the same.
 */
export function toSessionParts(raw: unknown): ISessionPart[] {
    if (!Array.isArray(raw)) return []
    const out: ISessionPart[] = []
    for (const raw_item of raw) {
        if (!raw_item || typeof raw_item !== 'object') continue
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) continue
        const detail = typeof item.detail === 'string' ? item.detail.trim() || undefined : undefined
        const roundsRaw = typeof item.rounds === 'number' ? Math.floor(item.rounds) : NaN
        const rounds = Number.isFinite(roundsRaw) && roundsRaw >= 1 ? roundsRaw : undefined
        const roundLabel =
            rounds && typeof item.roundLabel === 'string'
                ? item.roundLabel.trim() || undefined
                : undefined
        const roundDetails =
            rounds && Array.isArray(item.roundDetails)
                ? item.roundDetails.map((d) => (typeof d === 'string' ? d.trim() : '')).filter(Boolean)
                : undefined
        const roundSeconds =
            rounds && Array.isArray(item.roundSeconds)
                ? item.roundSeconds
                      .map((n) =>
                          typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0
                      )
                      .filter((n) => n > 0)
                : undefined
        const startRaw = typeof item.startAtSec === 'number' ? item.startAtSec : NaN
        const startAtSec =
            rounds && Number.isFinite(startRaw) && startRaw >= 0 ? Math.round(startRaw) : undefined
        const window = readWindow(item)
        const written = readReps(item.reps)
        if (written) {
            // Reps were written: the counter is worked out from them.
            const times = written.map(repSeconds)
            const allTimed = times.every((t): t is number => t !== undefined)
            const sameDo = written.every((r) => r.do === written[0].do)
            const label =
                (typeof item.roundLabel === 'string' && item.roundLabel.trim()) ||
                (sameDo && written.length > 1 ? written[0].do.toLowerCase() : 'rep')
            const repStart =
                Number.isFinite(startRaw) && startRaw >= 0 ? Math.round(startRaw) : undefined
            out.push({
                name,
                detail,
                reps: written,
                rounds: written.length,
                roundLabel: label,
                roundDetails: written.map(repLine),
                roundSeconds: allTimed ? times : roundSeconds?.length ? roundSeconds : undefined,
                startAtSec: repStart,
                ...window,
                ...readSteps(item),
            })
            continue
        }
        const steps = readSteps(item)
        const legacy = legacyReps({ rounds, roundLabel, roundDetails, steps: steps.steps })
        // A steps list becomes reps ticked on the counter, one per step.
        const fromSteps = !!legacy && !rounds
        out.push({
            name,
            detail,
            ...(legacy ? { reps: legacy } : {}),
            rounds: fromSteps ? legacy!.length : rounds,
            roundLabel: fromSteps ? 'step' : roundLabel,
            roundDetails: fromSteps
                ? legacy!.map((r) => r.do)
                : roundDetails && roundDetails.length
                  ? roundDetails
                  : undefined,
            roundSeconds: roundSeconds && roundSeconds.length ? roundSeconds : undefined,
            startAtSec,
            ...window,
            ...(fromSteps ? {} : steps),
        })
    }
    return out
}
