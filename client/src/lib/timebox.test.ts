import { describe, expect, it } from 'vitest'
import {
    agendaRows,
    boxedMinutes,
    dayBounds,
    nowOrNext,
    parseTimeboxImport,
    planSuggestions,
    stripSegments,
    unboxedWorkMinutes,
    workWindow,
    type PlanSuggestion,
} from './timebox'
import type { FitnessPlanEntry, MealPlanEntry, Timebox } from '../types'

const box = (id: string, startTime: string, endTime: string, title = id): Timebox => ({
    _id: id,
    date: '2026-11-10',
    title,
    startTime,
    endTime,
    exceptions: [],
    createdAt: '',
    updatedAt: '',
})

describe('dayBounds', () => {
    it('runs wake to bed in whole hours, widened for early blocks', () => {
        expect(dayBounds('06:30', '22:15', [])).toEqual({ start: 360, end: 1380 })
        expect(dayBounds('07:00', '23:00', [box('a', '05:15', '06:00')]).start).toBe(300)
    })
    it('falls back when bed is before wake', () => {
        expect(dayBounds('23:00', '07:00', [])).toEqual({ start: 420, end: 1380 })
    })
})

describe('boxedMinutes', () => {
    it('counts overlaps once and clips to the day', () => {
        const items = [box('a', '09:00', '10:00'), box('b', '09:30', '10:30'), box('c', '06:00', '08:00')]
        expect(boxedMinutes(items, 7 * 60, 23 * 60)).toBe(60 + 90)
    })
})

describe('nowOrNext', () => {
    it('finds the running block, else the next', () => {
        const items = [box('a', '09:00', '10:00'), box('b', '11:00', '12:00')]
        expect(nowOrNext(items, 9 * 60 + 30)).toMatchObject({ item: { _id: 'a' }, running: true })
        expect(nowOrNext(items, 10 * 60 + 30)).toMatchObject({ item: { _id: 'b' }, running: false })
        expect(nowOrNext(items, 13 * 60)).toBeNull()
    })
})

describe('planSuggestions', () => {
    const fit = (id: string, part: FitnessPlanEntry['part'], name: string, duration: number, skipped = false) =>
        ({ _id: id, part, order: 0, skipped, workout: { name, duration }, session: null }) as unknown as FitnessPlanEntry
    const meal = (slot: MealPlanEntry['slot'], name: string, away = false) =>
        ({ _id: name, slot, name, away, order: 0 }) as unknown as MealPlanEntry

    it('chains sessions in one part, skips skipped ones and away notes, merges a meal slot', () => {
        const out = planSuggestions(
            [fit('1', 'morning', 'Push', 45), fit('2', 'morning', 'Run', 30), fit('3', 'evening', 'Pull', 60, true)],
            [meal('lunch', 'Chicken rice'), meal('lunch', 'Yoghurt'), meal('dinner', 'Work do', true)],
            [box('x', '07:00', '07:45', 'push')]
        )
        expect(out.map((s) => [s.title, s.startTime, s.endTime, s.boxed])).toEqual([
            ['Push', '07:00', '07:45', true],
            ['Run', '07:45', '08:15', false],
            ['Lunch', '12:30', '13:00', false],
        ])
    })
})

describe('parseTimeboxImport', () => {
    it('reads a wrapped list with loose times', () => {
        const r = parseTimeboxImport('{ "blocks": [ { "title": "Deep work", "start": "9:00", "end": "11:00" } ] }')
        expect(r).toEqual({ items: [{ title: 'Deep work', start: '09:00', end: '11:00' }] })
    })
    it('explains what is wrong', () => {
        expect(parseTimeboxImport('nope')).toEqual({ error: 'That isn’t valid JSON.' })
        expect(parseTimeboxImport('[{"title":"x"}]')).toHaveProperty('error')
    })
})

describe('agendaRows', () => {
    const plan = (title: string, startTime: string, endTime: string, boxed = false): PlanSuggestion => ({
        key: title,
        kind: 'meal',
        title,
        detail: '',
        startTime,
        endTime,
        category: 'health',
        boxed,
    })

    it('fills the gaps with free rows and slots unboxed plans in by time', () => {
        const rows = agendaRows(
            [box('a', '09:00', '10:00'), box('b', '10:10', '11:00')],
            [plan('Lunch', '12:30', '13:00'), plan('Gym', '07:00', '08:00', true)],
            { start: 8 * 60, end: 14 * 60 }
        )
        expect(rows.map((r) => [r.kind, r.start, r.end])).toEqual([
            ['free', 480, 540],
            ['block', 540, 600],
            ['block', 610, 660],
            ['free', 660, 750],
            ['planned', 750, 780],
            ['free', 780, 840],
        ])
    })

    it('never shows free time inside an overlap', () => {
        const rows = agendaRows([box('a', '09:00', '12:00'), box('b', '10:00', '11:00')], [], { start: 540, end: 720 })
        expect(rows.map((r) => r.kind)).toEqual(['block', 'block'])
    })
})

describe('stripSegments', () => {
    it('places blocks as percentages and clips to the day', () => {
        const segs = stripSegments([box('a', '06:00', '08:00'), box('b', '12:00', '13:00')], { start: 420, end: 1380 })
        expect(segs.map((s) => [Math.round(s.left * 100) / 100, Math.round(s.width * 100) / 100])).toEqual([
            [0, 6.25],
            [31.25, 6.25],
        ])
    })
})

describe('working hours', () => {
    const settings = { workStart: '09:00', workEnd: '17:30', workDays: [1, 2, 3, 4, 5] }
    it('applies on working days only', () => {
        expect(workWindow('2026-11-10', settings)).toEqual({ start: 540, end: 1050 }) // Tuesday
        expect(workWindow('2026-11-15', settings)).toBeNull() // Sunday
        expect(workWindow('2026-11-10', { workStart: '09:00' })).toBeNull()
    })
    it('defaults to Mon–Fri', () => {
        expect(workWindow('2026-11-14', { workStart: '09:00', workEnd: '17:00' })).toBeNull() // Saturday
    })
    it('turns gaps inside work into work rows, split by blocks', () => {
        const work = { start: 540, end: 1050 }
        const rows = agendaRows([box('m', '11:00', '12:00')], [], { start: 420, end: 1380 }, work)
        expect(rows.map((r) => [r.kind, r.start, r.end])).toEqual([
            ['free', 420, 540],
            ['work', 540, 660],
            ['block', 660, 720],
            ['work', 720, 1050],
            ['free', 1050, 1380],
        ])
        expect(unboxedWorkMinutes([box('m', '11:00', '12:00')], work)).toBe(450)
    })
    it('widens the day to fit work', () => {
        expect(dayBounds('08:00', '22:00', [], { start: 420, end: 1080 }).start).toBe(420)
    })
    it('splits work around lunch', () => {
        const work = workWindow('2026-11-10', { ...settings, lunchStart: '12:30', lunchEnd: '13:15' })!
        expect(work.lunch).toEqual({ start: 750, end: 795 })
        const rows = agendaRows([], [], { start: 420, end: 1380 }, work)
        expect(rows.map((r) => [r.kind, r.start, r.end])).toEqual([
            ['free', 420, 540],
            ['work', 540, 750],
            ['lunch', 750, 795],
            ['work', 795, 1050],
            ['free', 1050, 1380],
        ])
        expect(unboxedWorkMinutes([], work)).toBe(510 - 45)
    })
    it('ignores a lunch outside work', () => {
        expect(workWindow('2026-11-10', { ...settings, lunchStart: '18:00', lunchEnd: '19:00' })!.lunch).toBeUndefined()
    })
})
