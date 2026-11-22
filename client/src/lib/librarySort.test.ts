import { describe, expect, it } from 'vitest'
import { isLibrarySort, isNew, sortLibrary } from './librarySort'

const items = [
    { name: 'Bravo', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' },
    { name: 'alpha', createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z' },
    { name: 'Charlie', createdAt: '2026-10-01T10:00:00Z' },
]

describe('sortLibrary', () => {
    it('keeps library order as it came, without touching the input', () => {
        const out = sortLibrary(items, 'library')
        expect(out.map((i) => i.name)).toEqual(['Bravo', 'alpha', 'Charlie'])
        expect(out).not.toBe(items)
    })
    it('puts the newest first for recently added', () => {
        expect(sortLibrary(items, 'recent').map((i) => i.name)).toEqual(['alpha', 'Bravo', 'Charlie'])
    })
    it('puts the oldest first', () => {
        expect(sortLibrary(items, 'oldest').map((i) => i.name)).toEqual(['Charlie', 'Bravo', 'alpha'])
    })
    it('orders by last edit, falling back to when it was added', () => {
        expect(sortLibrary(items, 'updated').map((i) => i.name)).toEqual(['Bravo', 'alpha', 'Charlie'])
    })
    it('sorts by name ignoring case', () => {
        expect(sortLibrary(items, 'name').map((i) => i.name)).toEqual(['alpha', 'Bravo', 'Charlie'])
    })
})

describe('isNew', () => {
    const now = Date.parse('2026-11-22T12:00:00Z')
    it('is true inside a week and false after', () => {
        expect(isNew({ createdAt: '2026-11-20T12:00:00Z' }, now)).toBe(true)
        expect(isNew({ createdAt: '2026-11-10T12:00:00Z' }, now)).toBe(false)
        expect(isNew({}, now)).toBe(false)
    })
})

describe('isLibrarySort', () => {
    it('accepts only known sorts', () => {
        expect(isLibrarySort('recent')).toBe(true)
        expect(isLibrarySort('nope')).toBe(false)
    })
})
