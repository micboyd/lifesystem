import { ISessionPart } from '../models/ConditioningSession'

/**
 * Normalise the `parts` array of an imported conditioning session, dropping
 * entries without a name.
 *
 * Shared by the conditioning importer and the training-plan importer: both read
 * the same session shape, and a part carries more than it looks like it does —
 * `rounds` turns it into a tap-to-count block, and `roundSeconds` plus
 * `startAtSec` are what put a running clock on each rep. Anything that
 * normalises parts must carry all of them, so there is only one copy of this.
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
        out.push({
            name,
            detail,
            rounds,
            roundLabel,
            roundDetails: roundDetails && roundDetails.length ? roundDetails : undefined,
            roundSeconds: roundSeconds && roundSeconds.length ? roundSeconds : undefined,
            startAtSec,
        })
    }
    return out
}
