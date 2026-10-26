import type { NutritionPhase } from '../types'

/**
 * One phase as the importer takes it, plus its target history.
 *
 * `adjustments` is carried for the record — what the targets were moved to and
 * when — but the importer ignores it, so a re-import starts the phase from its
 * opening `targets` with a clean history.
 */
export type PhaseExportItem = Record<string, unknown>

/** Fields that belong to the database row rather than the phase itself. */
const ROW_FIELDS = new Set(['_id', '__v', 'user', 'importBatch', 'createdAt', 'updatedAt'])

/**
 * A copy with undefined, null, empty objects and empty arrays dropped, and Mongo
 * `_id`s stripped at every depth — the noise that would make an export read
 * worse than a hand-written import.
 */
function clean(value: unknown, top = false): unknown {
    if (Array.isArray(value)) {
        const items = value.map((v) => clean(v)).filter((v) => v !== undefined)
        return items.length ? items : undefined
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [key, v] of Object.entries(value)) {
            if (key === '_id' || (top && ROW_FIELDS.has(key))) continue
            const c = clean(v)
            if (c !== undefined) out[key] = c
        }
        return Object.keys(out).length ? out : undefined
    }
    return value === null || value === undefined ? undefined : value
}

/** A phase rebuilt as an import entry. Key order follows the import template. */
export function phaseExportItem(phase: NutritionPhase): PhaseExportItem {
    const ordered = {
        name: phase.name,
        startDate: phase.startDate,
        endDate: phase.endDate,
        kind: phase.kind,
        targets: phase.targets,
        weeklyRate: phase.weeklyRate,
        goalMode: phase.goalMode,
        notes: phase.notes,
        goal: phase.goal,
        adaptive: phase.adaptive,
        macroPolicy: phase.macroPolicy,
        strategy: phase.strategy,
        adjustments: phase.adjustments,
    }
    // `targets` is required by the importer, so it survives even when empty.
    return { ...(clean(ordered, true) as PhaseExportItem), targets: clean(phase.targets) ?? {} }
}

/** The chosen phases as one importable array, oldest first. */
export function phaseExportDocument(phases: NutritionPhase[]): PhaseExportItem[] {
    return [...phases]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map(phaseExportItem)
}

/** "nutrition-phases-2026-10-25.json", or the phase's own name when only one is chosen. */
export function phaseExportFileName(phases: NutritionPhase[], today: string): string {
    if (phases.length === 1) {
        const slug = phases[0].name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
        if (slug) return `${slug}.json`
    }
    return `nutrition-phases-${today}.json`
}
