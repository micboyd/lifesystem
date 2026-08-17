import { describe, it, expect } from 'vitest'
import { inferMuscleGroup, inferEquipment, resolveTags, rankSwaps, tokenise } from './exerciseSwap'
import type { Exercise } from '../types'

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

let seq = 0
function ex(name: string, over: Partial<Exercise> = {}): Exercise {
    return {
        _id: over._id ?? `e${++seq}`,
        name,
        description: '',
        order: seq,
        ...STAMP,
        ...over,
    }
}

/** Just the names of the ranked options, best first. */
function names(options: { exercise: Exercise }[]): string[] {
    return options.map((o) => o.exercise.name)
}

describe('tokenise', () => {
    it('lowercases, splits on punctuation and drops plurals', () => {
        expect(tokenise('Pull-Ups')).toEqual(['pull', 'up'])
        expect(tokenise('Dumbbell  Bench Press')).toEqual(['dumbbell', 'bench', 'press'])
    })

    it('leaves "ss" endings and short words alone', () => {
        // "press" must not become "pres", or no equipment keyword would match.
        expect(tokenise('Press')).toEqual(['press'])
        expect(tokenise('Abs')).toEqual(['ab'])
    })
})

describe('inferMuscleGroup', () => {
    it('reads the obvious movements off the name', () => {
        expect(inferMuscleGroup(ex('Barbell bench press'))).toBe('Chest')
        expect(inferMuscleGroup(ex('Lat pulldown'))).toBe('Back')
        expect(inferMuscleGroup(ex('Leg press'))).toBe('Quads')
        expect(inferMuscleGroup(ex('Standing calf raise'))).toBe('Calves')
        expect(inferMuscleGroup(ex('Lateral raise'))).toBe('Shoulders')
    })

    it('lets the specific rule win over the general one', () => {
        // "leg curl" is hamstrings, not the biceps "curl"; likewise the RDL.
        expect(inferMuscleGroup(ex('Seated leg curl'))).toBe('Hamstrings')
        expect(inferMuscleGroup(ex('Romanian deadlift'))).toBe('Hamstrings')
        expect(inferMuscleGroup(ex('Conventional deadlift'))).toBe('Back')
        expect(inferMuscleGroup(ex('EZ-bar curl'))).toBe('Biceps')
    })

    it('matches whole words only', () => {
        // "ab" must not fire on "stable".
        expect(inferMuscleGroup(ex('Stable surface drill'))).toBeUndefined()
    })

    it('falls back to the description when the name says nothing', () => {
        expect(inferMuscleGroup(ex('Big Bertha', { description: 'Heavy chest pressing.' }))).toBe(
            'Chest'
        )
    })

    it('returns undefined when nothing matches', () => {
        expect(inferMuscleGroup(ex('Mystery move'))).toBeUndefined()
    })
})

describe('inferEquipment', () => {
    it('reads kit off the name', () => {
        expect(inferEquipment(ex('Leg press'))).toBe('Machine')
        expect(inferEquipment(ex('Cable fly'))).toBe('Cable')
        expect(inferEquipment(ex('Dumbbell row'))).toBe('Dumbbell')
        expect(inferEquipment(ex('Push-ups'))).toBe('Bodyweight')
    })

    it('reads "smith machine" as its own station, not a plain machine', () => {
        expect(inferEquipment(ex('Smith machine squat'))).toBe('Smith machine')
    })
})

describe('resolveTags', () => {
    it('prefers the explicit tag over the guess', () => {
        const tags = resolveTags(ex('Leg press', { muscleGroup: 'Glutes' }))
        expect(tags.muscleGroup).toBe('Glutes')
        expect(tags.taggedGroup).toBe(true)
    })

    it('marks inferred values as untagged', () => {
        const tags = resolveTags(ex('Leg press'))
        expect(tags).toMatchObject({ muscleGroup: 'Quads', taggedGroup: false, taggedEquipment: false })
    })

    it('ignores a whitespace-only tag', () => {
        expect(resolveTags(ex('Leg press', { muscleGroup: '   ' })).muscleGroup).toBe('Quads')
    })
})

describe('rankSwaps', () => {
    const legPress = ex('Leg press', { _id: 'legpress' })
    const library = [
        legPress,
        ex('Goblet squat', { _id: 'goblet' }),
        ex('Bulgarian split squat', { _id: 'bulgarian' }),
        ex('Hack squat', { _id: 'hack' }),
        ex('Barbell bench press', { _id: 'bench' }),
        ex('Lat pulldown', { _id: 'pulldown' }),
    ]

    it('only offers exercises for the same muscle group', () => {
        const got = names(rankSwaps(legPress, library))
        expect(got).toContain('Goblet squat')
        expect(got).not.toContain('Barbell bench press')
        expect(got).not.toContain('Lat pulldown')
    })

    it('never offers the exercise being swapped', () => {
        expect(names(rankSwaps(legPress, library))).not.toContain('Leg press')
    })

    it('ranks a free-weight alternative above another machine', () => {
        const got = names(rankSwaps(legPress, library))
        // Both are quads, but the hack squat is a station that may also be taken.
        expect(got.indexOf('Bulgarian split squat')).toBeLessThan(got.indexOf('Hack squat'))
    })

    it('flags options that get you off a fixed station', () => {
        const options = rankSwaps(legPress, library)
        const goblet = options.find((o) => o.exercise._id === 'goblet')
        const hack = options.find((o) => o.exercise._id === 'hack')
        expect(goblet?.avoidsStation).toBe(true)
        expect(hack?.avoidsStation).toBe(false)
    })

    it('skips exercises already in the session', () => {
        const got = names(rankSwaps(legPress, library, { excludeIds: ['goblet', 'bulgarian'] }))
        expect(got).not.toContain('Goblet squat')
        expect(got).not.toContain('Bulgarian split squat')
        expect(got).toContain('Hack squat')
    })

    it('honours the limit', () => {
        expect(rankSwaps(legPress, library, { limit: 2 })).toHaveLength(2)
    })

    it('respects explicit tags over inference', () => {
        // Tagged as glutes, so the quad options no longer apply.
        const tagged = ex('Machine X', { _id: 'x', muscleGroup: 'Glutes', equipment: 'Machine' })
        const hipThrust = ex('Barbell hip thrust', { _id: 'thrust' })
        const got = names(rankSwaps(tagged, [...library, tagged, hipThrust]))
        expect(got).toEqual(['Barbell hip thrust'])
    })

    it('falls back to name overlap when a group cannot be determined', () => {
        const mystery = ex('Zercher thing', { _id: 'm1' })
        const sibling = ex('Zercher hold', { _id: 'm2' })
        const unrelated = ex('Mystery move', { _id: 'm3' })
        const got = names(rankSwaps(mystery, [mystery, sibling, unrelated]))
        expect(got).toEqual(['Zercher hold'])
    })

    it('returns nothing when the library has no relative', () => {
        expect(rankSwaps(legPress, [legPress, ex('Barbell bench press')])).toEqual([])
    })

    it('explains itself in the reason line', () => {
        const [best] = rankSwaps(legPress, library)
        expect(best.reason).toContain('Same quads work')
        expect(best.reason).toContain('nothing to queue for')
    })
})
