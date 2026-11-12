import { describe, expect, it } from 'vitest'
import {
    agendaRows,
    clashGroups,
    clashesWith,
    inLunch,
    ownBlocks,
    boxedMinutes,
    dayBounds,
    nowOrNext,
    parseImportRepeat,
    parseTimeboxImport,
    planSuggestions,
    stripSegments,
    unboxedWorkMinutes,
    workWindow,
    type PlanSuggestion,
} from './timebox'
import type { MealPlanEntry, Timebox } from '../types'

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
    const meal = (slot: MealPlanEntry['slot'], name: string, away = false) =>
        ({ _id: name, slot, name, away, order: 0 }) as unknown as MealPlanEntry

    it('skips away notes, merges a meal slot and spots one already boxed', () => {
        const out = planSuggestions(
            [meal('breakfast', 'Oats'), meal('lunch', 'Chicken rice'), meal('lunch', 'Yoghurt'), meal('dinner', 'Work do', true)],
            [box('x', '08:00', '08:30', 'oats')]
        )
        expect(out.map((s) => [s.title, s.startTime, s.endTime, s.boxed])).toEqual([
            ['Oats', '08:00', '08:30', true],
            ['Lunch', '12:30', '13:00', false],
        ])
    })
})

describe('parseTimeboxImport', () => {
    it('reads a wrapped list with loose times', () => {
        const r = parseTimeboxImport('{ "blocks": [ { "title": "Deep work", "start": "9:00", "end": "11:00" } ] }')
        expect(r).toEqual({ items: [{ title: 'Deep work', start: '09:00', end: '11:00' }] })
    })
    it('reads a repeat on named days, with an end date', () => {
        const r = parseTimeboxImport(
            '[{ "title": "Gym", "start": "7:00", "end": "8:00", "repeat": ["Mon", "wednesday", "fri"], "until": "2026-12-31" }]'
        )
        expect(r).toEqual({
            items: [
                {
                    title: 'Gym',
                    start: '07:00',
                    end: '08:00',
                    recurrence: { freq: 'custom', days: [1, 3, 5], until: '2026-12-31' },
                },
            ],
        })
    })
    it('rejects a day it does not know', () => {
        expect(parseTimeboxImport('[{ "title": "x", "start": "9:00", "end": "10:00", "repeat": ["mon", "funday"] }]')).toEqual({
            error: 'Block 1: "funday" isn’t a day — use mon, tue, wed, thu, fri, sat, sun',
        })
    })
    it('explains what is wrong', () => {
        expect(parseTimeboxImport('nope')).toEqual({ error: 'That isn’t valid JSON.' })
        expect(parseTimeboxImport('[{"title":"x"}]')).toHaveProperty('error')
    })
})

describe('agendaRows', () => {
    const plan = (title: string, startTime: string, endTime: string, boxed = false): PlanSuggestion => ({
        key: title,
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

describe('Google meetings in working hours', () => {
    const work = { start: 540, end: 1050, lunch: { start: 750, end: 795 } }
    const meeting = (id: string, startTime: string, endTime: string): Timebox => ({
        ...box(id, startTime, endTime),
        source: 'ical',
    })

    it('lists meetings inside the work row instead of splitting it', () => {
        const rows = agendaRows(
            [meeting('standup', '09:30', '09:45'), meeting('review', '14:00', '15:00')],
            [],
            { start: 420, end: 1380 },
            work
        )
        expect(rows.map((r) => [r.kind, r.start, r.end])).toEqual([
            ['free', 420, 540],
            ['work', 540, 750],
            ['lunch', 750, 795],
            ['work', 795, 1050],
            ['free', 1050, 1380],
        ])
        const workRows = rows.filter((r) => r.kind === 'work')
        expect(workRows.map((r) => (r.kind === 'work' ? r.meetings.map((m) => m._id) : []))).toEqual([
            ['standup'],
            ['review'],
        ])
    })

    it('still splits work around your own blocks, with meetings in the piece they start in', () => {
        const rows = agendaRows(
            [box('focus', '10:00', '11:00'), meeting('sync', '11:15', '11:45')],
            [],
            { start: 540, end: 1050 },
            { start: 540, end: 1050 }
        )
        expect(rows.map((r) => [r.kind, r.start, r.kind === 'work' ? r.meetings.length : '-'])).toEqual([
            ['work', 540, 0],
            ['block', 600, '-'],
            ['work', 660, 1],
        ])
    })

    it('nests a meeting under your own block, and keeps one with nothing around it as a block', () => {
        const rows = agendaRows(
            [meeting('early', '08:00', '08:30'), box('focus', '10:00', '11:00'), meeting('clash', '10:15', '10:45')],
            [],
            { start: 480, end: 1050 },
            work
        )
        const blocks = rows.filter((r) => r.kind === 'block')
        expect(blocks.map((r) => (r.kind === 'block' ? [r.item._id, r.meetings.map((m) => m._id)] : []))).toEqual([
            ['early', []],
            ['focus', ['clash']],
        ])
    })

    it('fills a day of your own blocks with its meetings, each in the block or lunch break it starts in', () => {
        const day = [
            box('morning', '08:30', '12:30'),
            box('gym', '12:40', '13:25'),
            box('afternoon', '14:00', '17:30'),
            box('evening', '17:30', '21:30'),
            meeting('daily', '09:15', '09:45'),
            meeting('lunchtime', '12:45', '13:00'),
            meeting('review', '15:00', '15:45'),
            meeting('late', '18:00', '18:30'),
        ]
        const rows = agendaRows(day, [], { start: 420, end: 1380 }, work)
        const held = Object.fromEntries(
            rows.filter((r) => r.kind === 'block').map((r) => (r.kind === 'block' ? [r.item._id, r.meetings.map((m) => m._id)] : []))
        )
        expect(held).toEqual({ morning: ['daily'], afternoon: ['review'], evening: ['late'] })
        // Gym starts in the lunch break, so it and the lunchtime meeting sit in the lunch block.
        const lunch = rows.find((r) => r.kind === 'lunch')
        expect(lunch?.kind === 'lunch' && lunch.items.map((i) => i._id)).toEqual(['gym', 'lunchtime'])
        expect(rows.some((r) => r.kind === 'block' && r.item.source)).toBe(false)
    })

    it('flags meetings in the lunch break, wherever they sit', () => {
        expect(inLunch(meeting('a', '12:45', '13:00'), work)).toBe(true)
        expect(inLunch(meeting('b', '14:00', '14:30'), work)).toBe(false)
        expect(inLunch(meeting('c', '12:45', '13:00'), null)).toBe(false)
    })

    it('counts work meetings as work, not as boxed time', () => {
        const items = [meeting('standup', '09:30', '10:00'), meeting('evening', '19:00', '20:00'), box('gym', '18:00', '19:00')]
        expect(ownBlocks(items, work).map((i) => i._id)).toEqual(['evening', 'gym'])
        expect(ownBlocks(items, null).map((i) => i._id)).toEqual(['standup', 'evening', 'gym'])
    })
})

describe('meetings over the lunch break', () => {
    const work = { start: 510, end: 1050, lunch: { start: 750, end: 840 } } // 08:30–17:30, lunch 12:30–14:00
    const meeting = (id: string, startTime: string, endTime: string): Timebox => ({
        ...box(id, startTime, endTime),
        source: 'ical',
    })

    it('sits inside the lunch row, leaving the break where it is', () => {
        const rows = agendaRows([meeting('lee', '13:30', '14:00'), meeting('later', '15:00', '15:45')], [], { start: 420, end: 1380 }, work)
        expect(rows.map((r) => [r.kind, r.start, r.end])).toEqual([
            ['free', 420, 510],
            ['work', 510, 750],
            ['lunch', 750, 840],
            ['work', 840, 1050],
            ['free', 1050, 1380],
        ])
        const lunch = rows.find((r) => r.kind === 'lunch')
        expect(lunch?.kind === 'lunch' && lunch.items.map((m) => m._id)).toEqual(['lee'])
        const after = rows.find((r) => r.kind === 'work' && r.start === 840)
        expect(after?.kind === 'work' && after.meetings.map((m) => m._id)).toEqual(['later'])
    })
    it('keeps lunch as one block holding your own lunchtime blocks and meetings', () => {
        const day = [
            box('morning', '08:30', '12:30'),
            box('travel', '12:30', '12:40'),
            box('workout', '12:40', '13:25'),
            box('shower', '13:35', '13:45'),
            box('lunch', '13:45', '14:00'),
            box('afternoon', '14:00', '17:30'),
            meeting('call', '12:45', '13:15'),
        ]
        const rows = agendaRows(day, [], { start: 420, end: 1380 }, work)
        expect(rows.map((r) => [r.kind, r.start])).toEqual([
            ['free', 420],
            ['block', 510],
            ['lunch', 750],
            ['block', 840],
            ['free', 1050],
        ])
        const lunch = rows.find((r) => r.kind === 'lunch')
        expect(lunch?.kind === 'lunch' && lunch.items.map((i) => i._id)).toEqual(['travel', 'workout', 'call', 'shower', 'lunch'])
    })
})

describe('clashGroups', () => {
    it('groups overlapping items so they can sit side by side', () => {
        const items = [box('travel', '12:30', '12:40'), box('workout', '12:40', '13:25'), box('call', '12:45', '13:15'), box('shower', '13:35', '13:45')]
        expect(clashGroups(items).map((g) => g.map((i) => i._id))).toEqual([['travel'], ['workout', 'call'], ['shower']])
    })
    it('names only the items that actually overlap', () => {
        const group = [box('a', '09:00', '10:00'), box('b', '09:30', '10:30'), box('c', '10:15', '11:00')]
        expect(clashGroups(group)).toHaveLength(1)
        expect(clashesWith(group[0], group).map((i) => i._id)).toEqual(['b'])
        expect(clashesWith(group[1], group).map((i) => i._id)).toEqual(['a', 'c'])
    })
})

describe('parseImportRepeat', () => {
    it('takes the named frequencies', () => {
        expect(parseImportRepeat('weekdays', undefined)).toEqual({ freq: 'weekdays' })
        expect(parseImportRepeat('Daily', undefined)).toEqual({ freq: 'daily' })
        expect(parseImportRepeat('weekly', '2027-01-31')).toEqual({ freq: 'weekly', until: '2027-01-31' })
    })
    it('takes days as a list or a comma string, in week order without repeats', () => {
        expect(parseImportRepeat('sun, tues, thurs, tue', undefined)).toEqual({ freq: 'custom', days: [0, 2, 4] })
        expect(parseImportRepeat(['Sat.'], undefined)).toEqual({ freq: 'custom', days: [6] })
    })
    it('means no repeat when missing or "none"', () => {
        expect(parseImportRepeat(undefined, undefined)).toBeNull()
        expect(parseImportRepeat('none', undefined)).toBeNull()
    })
    it('explains bad input', () => {
        expect(parseImportRepeat(42, undefined)).toHaveProperty('error')
        expect(parseImportRepeat('weekdays', 'friday')).toHaveProperty('error')
        expect(parseImportRepeat([], undefined)).toHaveProperty('error')
    })
})
