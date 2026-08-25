import { describe, it, expect, beforeEach } from 'vitest'
import {
    DRAFT_TTL_MS,
    clearDraft,
    describeAge,
    draftSignature,
    readDraft,
    writeDraft,
    type DraftExercise,
} from './workoutLogDraft'

/** Minimal localStorage — the test environment is node, which has none. */
class MemoryStorage {
    private map = new Map<string, string>()
    getItem(k: string): string | null {
        return this.map.has(k) ? (this.map.get(k) as string) : null
    }
    setItem(k: string, v: string): void {
        this.map.set(k, String(v))
    }
    removeItem(k: string): void {
        this.map.delete(k)
    }
    raw(k: string): string | undefined {
        return this.map.get(k)
    }
    put(k: string, v: string): void {
        this.map.set(k, v)
    }
}

let store: MemoryStorage

beforeEach(() => {
    store = new MemoryStorage()
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = store
})

const SIG = draftSignature(['a', 'b'])
const NOW = 1_700_000_000_000

function rows(): DraftExercise[] {
    return [
        {
            exerciseId: 'a',
            name: 'Bench press',
            prescription: '3 × 8',
            sets: [{ weight: '60', reps: '8' }],
        },
        { exerciseId: 'b', name: 'Row', prescription: '3 × 10', sets: [{ weight: '', reps: '' }] },
    ]
}

function save(over: Partial<Parameters<typeof writeDraft>[1]> = {}, at = NOW): void {
    writeDraft(
        'w1',
        { signature: SIG, date: '2026-08-25', notes: '', exercises: rows(), ...over },
        at
    )
}

describe('readDraft / writeDraft', () => {
    it('returns null when nothing was saved', () => {
        expect(readDraft('w1', SIG, NOW)).toBeNull()
    })

    it('round-trips what was typed, blanks and all', () => {
        save({ notes: 'felt heavy' })
        const draft = readDraft('w1', SIG, NOW)
        expect(draft?.notes).toBe('felt heavy')
        expect(draft?.date).toBe('2026-08-25')
        expect(draft?.exercises[0].sets[0]).toEqual({ weight: '60', reps: '8' })
        expect(draft?.exercises[1].sets[0]).toEqual({ weight: '', reps: '' })
        expect(draft?.savedAt).toBe(NOW)
    })

    it('keeps swaps and skipped rows', () => {
        const exercises = rows()
        exercises[0].swappedFrom = { id: 'a', name: 'Barbell bench' }
        exercises[0].exerciseId = 'c'
        exercises[1].removed = true
        save({ exercises })
        const draft = readDraft('w1', SIG, NOW)
        expect(draft?.exercises[0].swappedFrom).toEqual({ id: 'a', name: 'Barbell bench' })
        expect(draft?.exercises[0].exerciseId).toBe('c')
        expect(draft?.exercises[1].removed).toBe(true)
    })

    it('keeps drafts apart per workout', () => {
        save()
        expect(readDraft('w2', SIG, NOW)).toBeNull()
    })

    it('refuses a draft seeded from a different line-up', () => {
        // The workout gained an exercise since — the rows no longer line up.
        save()
        expect(readDraft('w1', draftSignature(['a', 'b', 'c']), NOW)).toBeNull()
    })

    it('refuses a draft older than the TTL', () => {
        save()
        expect(readDraft('w1', SIG, NOW + DRAFT_TTL_MS - 1)).not.toBeNull()
        expect(readDraft('w1', SIG, NOW + DRAFT_TTL_MS + 1)).toBeNull()
    })

    it('survives junk in storage', () => {
        store.put('workoutLogDraft:w1', '{not json')
        expect(readDraft('w1', SIG, NOW)).toBeNull()
        store.put(
            'workoutLogDraft:w1',
            JSON.stringify({ signature: SIG, savedAt: NOW, date: '2026-08-25' })
        )
        expect(readDraft('w1', SIG, NOW)).toBeNull()
        store.put(
            'workoutLogDraft:w1',
            JSON.stringify({
                signature: SIG,
                savedAt: NOW,
                date: '2026-08-25',
                exercises: [{ exerciseId: 'a', name: 'Bench', sets: [{ weight: 60, reps: 8 }] }],
            })
        )
        // Numbers where strings belong — a shape this module never wrote.
        expect(readDraft('w1', SIG, NOW)).toBeNull()
    })

    it('clears the draft once the log is saved', () => {
        save()
        clearDraft('w1')
        expect(readDraft('w1', SIG, NOW)).toBeNull()
    })
})

describe('describeAge', () => {
    it('reads as a person would say it', () => {
        expect(describeAge(NOW, NOW + 20_000)).toBe('just now')
        expect(describeAge(NOW, NOW + 61_000)).toBe('1 minute ago')
        expect(describeAge(NOW, NOW + 12 * 60_000)).toBe('12 minutes ago')
        expect(describeAge(NOW, NOW + 65 * 60_000)).toBe('1 hour ago')
        expect(describeAge(NOW, NOW + 200 * 60_000)).toBe('3 hours ago')
    })

    it("doesn't go negative when the clock drifts", () => {
        expect(describeAge(NOW, NOW - 5000)).toBe('just now')
    })
})
