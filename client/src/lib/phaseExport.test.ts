import { describe, it, expect } from 'vitest'
import { phaseExportDocument, phaseExportFileName, phaseExportItem } from './phaseExport'
import type { NutritionPhase } from '../types'

function phase(over: Partial<NutritionPhase> = {}): NutritionPhase {
    return {
        _id: 'p1',
        name: 'Winter cut',
        startDate: '2026-11-02',
        endDate: '2027-01-31',
        kind: 'cut',
        targets: { calories: 2100, protein: 180 },
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        ...over,
    }
}

describe('phaseExportItem', () => {
    it('drops row fields and keeps the import shape', () => {
        expect(phaseExportItem(phase())).toEqual({
            name: 'Winter cut',
            startDate: '2026-11-02',
            endDate: '2027-01-31',
            kind: 'cut',
            targets: { calories: 2100, protein: 180 },
        })
    })

    it('strips nested _ids and empty blocks but keeps the history', () => {
        const item = phaseExportItem(
            phase({
                goal: {},
                macroPolicy: { protein: 'minimum' },
                adjustments: [
                    {
                        _id: 'a1',
                        effectiveFrom: '2026-12-01',
                        targets: { calories: 2000 },
                        source: 'adaptive',
                    } as never,
                ],
            })
        )
        expect(item.goal).toBeUndefined()
        expect(item.macroPolicy).toEqual({ protein: 'minimum' })
        expect(item.adjustments).toEqual([
            { effectiveFrom: '2026-12-01', targets: { calories: 2000 }, source: 'adaptive' },
        ])
    })

    it('keeps targets even when none are set, since the importer needs it', () => {
        expect(phaseExportItem(phase({ targets: {} })).targets).toEqual({})
    })
})

describe('phaseExportDocument', () => {
    it('orders phases oldest first', () => {
        const doc = phaseExportDocument([
            phase({ name: 'B', startDate: '2027-02-01' }),
            phase({ name: 'A', startDate: '2026-11-02' }),
        ])
        expect(doc.map((p) => p.name)).toEqual(['A', 'B'])
    })
})

describe('phaseExportFileName', () => {
    it('names a single phase after itself and a set after the day', () => {
        expect(phaseExportFileName([phase()], '2026-10-25')).toBe('winter-cut.json')
        expect(phaseExportFileName([phase(), phase()], '2026-10-25')).toBe(
            'nutrition-phases-2026-10-25.json'
        )
    })
})
