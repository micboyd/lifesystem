import { describe, expect, it, vi } from 'vitest'
import plan from '../lib/__fixtures__/prop-nov-may-outdoor.json'
import type { IPlanEntryGarmin } from '../models/FitnessPlanEntry'
import { GarminError, type GarminWorkoutProvider } from './provider'
import { ConnectProvider } from './connectProvider'
import type { WorkerRun } from './pythonWorker'
import {
    entryGarminState,
    previewSession,
    SCHEDULED_ONLY_MESSAGE,
    sendEntry,
    type SyncEntry,
    type SyncSession,
    type SyncStore,
} from './sync'
import { handle } from '../controllers/garminController'

const SECRET = 'hunter2-very-secret'

const raw = plan.conditioning.post10KSessionLibrary.find((s) => s.name.startsWith('Outdoor Run-Walk 1'))!
const session: SyncSession = { _id: 'sess1', ...(raw as unknown as Omit<SyncSession, '_id'>) }

/** Garmin, in memory: workouts by id, calendar placements by id. */
function fakeGarmin() {
    let next = 100
    const workouts = new Map<string, { name: string; steps: unknown }>()
    const calendar = new Map<string, { workoutId: string; date: string }>()
    const provider: GarminWorkoutProvider = {
        createWorkout: vi.fn(async (w) => {
            const id = String(next++)
            workouts.set(id, { name: w.name, steps: w.steps })
            return { workoutId: id }
        }),
        updateWorkout: vi.fn(async (id, w) => {
            if (!workouts.has(id)) throw new GarminError('not_found')
            workouts.set(id, { name: w.name, steps: w.steps })
        }),
        scheduleWorkout: vi.fn(async (workoutId, date) => {
            if (!workouts.has(workoutId)) throw new GarminError('not_found')
            const id = String(next++)
            calendar.set(id, { workoutId, date })
            return { scheduleId: id }
        }),
        unscheduleWorkout: vi.fn(async (id) => {
            calendar.delete(id)
        }),
        sendToDevice: vi.fn(async () => ({ deviceName: 'Forerunner 265' })),
    }
    return { provider, workouts, calendar }
}

function memoryStore() {
    const workouts = new Map<string, { workoutId: string; stepsHash: string }>()
    const entries = new Map<string, IPlanEntryGarmin>()
    const store: SyncStore = {
        getWorkout: async (sid) => workouts.get(sid) ?? null,
        saveWorkout: async (sid, workoutId, stepsHash) => void workouts.set(sid, { workoutId, stepsHash }),
        saveEntry: async (id, g) => void entries.set(id, g),
        markWorkoutEntries: async (workoutId, stepsHash) => {
            for (const [id, g] of entries) if (g.workoutId === workoutId) entries.set(id, { ...g, stepsHash })
        },
    }
    return { store, workouts, entries }
}

describe('sendEntry', () => {
    it('creates, schedules and pushes on the first send', async () => {
        const g = fakeGarmin()
        const s = memoryStore()
        const r = await sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)
        expect(r.pushed).toBe(true)
        expect(r.message).toBe('Sent to Forerunner 265.')
        expect(g.workouts.size).toBe(1)
        expect([...g.calendar.values()]).toEqual([{ workoutId: r.garmin.workoutId, date: '2026-11-03' }])
        expect(s.entries.get('e1')).toEqual(r.garmin)
        expect(g.workouts.get(r.garmin.workoutId)!.name).toBe(session.name)
    })

    it('sending again changes nothing on Garmin', async () => {
        const g = fakeGarmin()
        const s = memoryStore()
        const entry: SyncEntry = { _id: 'e1', date: '2026-11-03' }
        const first = await sendEntry(entry, session, g.provider, s.store)
        const second = await sendEntry({ ...entry, garmin: s.entries.get('e1') }, session, g.provider, s.store)
        expect(g.provider.createWorkout).toHaveBeenCalledTimes(1)
        expect(g.provider.updateWorkout).not.toHaveBeenCalled()
        expect(g.provider.scheduleWorkout).toHaveBeenCalledTimes(1)
        expect(g.provider.unscheduleWorkout).not.toHaveBeenCalled()
        expect(second.garmin.scheduleId).toBe(first.garmin.scheduleId)
        expect(g.calendar.size).toBe(1)
    })

    it('reuses one workout for the same session on different days', async () => {
        const g = fakeGarmin()
        const s = memoryStore()
        const a = await sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)
        const b = await sendEntry({ _id: 'e2', date: '2026-11-10' }, session, g.provider, s.store)
        expect(g.workouts.size).toBe(1)
        expect(b.garmin.workoutId).toBe(a.garmin.workoutId)
        expect(g.calendar.size).toBe(2)
    })

    it('updates the workout in place when the session changes, and every day follows', async () => {
        const g = fakeGarmin()
        const s = memoryStore()
        await sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)
        await sendEntry({ _id: 'e2', date: '2026-11-10' }, session, g.provider, s.store)
        const edited: SyncSession = { ...session, name: 'Outdoor Run-Walk 1 (edited)' }
        const hash = previewSession(edited).hash
        expect(entryGarminState({ _id: 'e2', date: '2026-11-10', garmin: s.entries.get('e2') }, hash)).toBe('out_of_date')

        await sendEntry({ _id: 'e1', date: '2026-11-03', garmin: s.entries.get('e1') }, edited, g.provider, s.store)
        expect(g.provider.createWorkout).toHaveBeenCalledTimes(1)
        expect(g.provider.updateWorkout).toHaveBeenCalledTimes(1)
        expect(g.workouts.size).toBe(1)
        // The other day was scheduled with the same workout, so it's current too.
        expect(entryGarminState({ _id: 'e2', date: '2026-11-10', garmin: s.entries.get('e2') }, hash)).toBe('sent')
    })

    it('a moved entry is flagged, and resending moves its Garmin day', async () => {
        const g = fakeGarmin()
        const s = memoryStore()
        await sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)
        const moved: SyncEntry = { _id: 'e1', date: '2026-11-05', garmin: s.entries.get('e1') }
        expect(entryGarminState(moved, previewSession(session).hash)).toBe('moved')
        const r = await sendEntry(moved, session, g.provider, s.store)
        expect(g.provider.unscheduleWorkout).toHaveBeenCalledTimes(1)
        expect([...g.calendar.values()]).toEqual([{ workoutId: r.garmin.workoutId, date: '2026-11-05' }])
        expect(entryGarminState({ ...moved, garmin: r.garmin }, previewSession(session).hash)).toBe('sent')
    })

    it('makes the workout again if it was deleted on Garmin', async () => {
        const g = fakeGarmin()
        const s = memoryStore()
        await sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)
        g.workouts.clear()
        await sendEntry({ _id: 'e2', date: '2026-11-04' }, { ...session, name: 'Changed' }, g.provider, s.store)
        expect(g.provider.createWorkout).toHaveBeenCalledTimes(2)
        expect(g.workouts.size).toBe(1)
    })

    it('rescheduling a moved entry makes the workout again if it was deleted on Garmin', async () => {
        const g = fakeGarmin()
        const s = memoryStore()
        await sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)
        g.workouts.clear()
        const moved: SyncEntry = { _id: 'e1', date: '2026-11-02', garmin: s.entries.get('e1') }
        const r = await sendEntry(moved, session, g.provider, s.store)
        expect(g.provider.createWorkout).toHaveBeenCalledTimes(2)
        expect([...g.calendar.values()]).toEqual([{ workoutId: r.garmin.workoutId, date: '2026-11-02' }])
        expect((await s.store.getWorkout('sess1'))?.workoutId).toBe(r.garmin.workoutId)
    })

    it('a failed push still counts: scheduled, sync the watch', async () => {
        const g = fakeGarmin()
        vi.mocked(g.provider.sendToDevice).mockRejectedValue(new GarminError('no_device'))
        const s = memoryStore()
        const r = await sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)
        expect(r.pushed).toBe(false)
        expect(r.message).toBe(SCHEDULED_ONLY_MESSAGE)
        expect(s.entries.get('e1')).toBeDefined()
    })

    it('an expired session fails the send and records nothing', async () => {
        const g = fakeGarmin()
        vi.mocked(g.provider.createWorkout).mockRejectedValue(new GarminError('session_expired'))
        const s = memoryStore()
        await expect(sendEntry({ _id: 'e1', date: '2026-11-03' }, session, g.provider, s.store)).rejects.toMatchObject({
            code: 'session_expired',
        })
        expect(s.entries.size).toBe(0)
    })
})

describe('ConnectProvider', () => {
    it('saves refreshed tokens and sends Garmin units', async () => {
        const run = vi.fn(async (req: Record<string, unknown>) => ({
            result: { workoutId: '7' },
            tokens: req.op === 'create' ? 'fresh-tokens' : undefined,
        })) as unknown as WorkerRun
        const saved: string[] = []
        const p = new ConnectProvider('old-tokens', async (t) => void saved.push(t), run)
        await p.createWorkout({ name: 'W', steps: previewSession(session).steps, estimatedSeconds: 60 })
        const req = vi.mocked(run).mock.calls[0][0] as { tokens: string; workout: { workoutSegments: unknown[] } }
        expect(req.tokens).toBe('old-tokens')
        expect(JSON.stringify(req.workout)).toContain('"targetValueOne":1.851852')
        expect(saved).toEqual(['fresh-tokens'])
        await p.scheduleWorkout('7', '2026-11-03')
        expect((vi.mocked(run).mock.calls[1][0] as { tokens: string }).tokens).toBe('fresh-tokens')
    })

    it('passes token expiry through as session_expired', async () => {
        const run = (async () => {
            throw new GarminError('session_expired')
        }) as WorkerRun
        const p = new ConnectProvider('t', async () => {}, run)
        await expect(p.sendToDevice('1')).rejects.toMatchObject({ code: 'session_expired' })
    })
})

describe('Garmin routes never leak credentials', () => {
    function fakeRes() {
        const res = { statusCode: 200, body: undefined as unknown, status(c: number) { res.statusCode = c; return res }, json(b: unknown) { res.body = b; return res } }
        return res
    }

    it('a Garmin failure returns only its fixed message', async () => {
        const res = fakeRes()
        await handle(async () => {
            throw new GarminError('session_expired')
        })({ body: { password: SECRET } } as never, res as never)
        expect(res.statusCode).toBe(409)
        expect(res.body).toEqual({ message: expect.any(String), code: 'session_expired' })
        expect(JSON.stringify(res.body)).not.toContain(SECRET)
    })

    it('any other failure is a plain 500, and the log names no secret', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {})
        const res = fakeRes()
        await handle(async () => {
            throw new Error(`login failed for password ${SECRET}`)
        })({ body: { password: SECRET } } as never, res as never)
        expect(res.statusCode).toBe(500)
        expect(JSON.stringify(res.body)).not.toContain(SECRET)
        for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain(SECRET)
        log.mockRestore()
    })
})
