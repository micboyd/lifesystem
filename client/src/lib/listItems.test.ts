import { describe, expect, it } from 'vitest'
import { insertAfter, linesToItems, listSummary, moveItem } from './listItems'
import type { ListItem } from '../types'

const item = (id: string, text = id, done = false): ListItem => ({ id, text, done })

describe('insertAfter / moveItem', () => {
    it('inserts after the given item, or at the end', () => {
        const items = [item('a'), item('b')]
        expect(insertAfter(items, 'a', item('x')).map((i) => i.id)).toEqual(['a', 'x', 'b'])
        expect(insertAfter(items, null, item('x')).map((i) => i.id)).toEqual(['a', 'b', 'x'])
    })

    it('moves one place and stops at the ends', () => {
        const items = [item('a'), item('b'), item('c')]
        expect(moveItem(items, 'b', -1).map((i) => i.id)).toEqual(['b', 'a', 'c'])
        expect(moveItem(items, 'c', 1)).toBe(items)
    })
})

describe('linesToItems', () => {
    it('splits lines and strips list markers', () => {
        const items = linesToItems('- milk\n* eggs\n\n2. bread\n[x] coffee\n• tea')
        expect(items.map((i) => [i.text, i.done])).toEqual([
            ['milk', false],
            ['eggs', false],
            ['bread', false],
            ['coffee', true],
            ['tea', false],
        ])
    })
})

describe('listSummary', () => {
    it('counts done items on a checklist and ignores blank rows', () => {
        const items = [item('a', 'a', true), item('b'), item('c', '  ')]
        expect(listSummary('checklist', items)).toBe('1 of 2 done')
        expect(listSummary('bullets', items)).toBe('2 items')
        expect(listSummary('numbered', [])).toBe('Empty')
    })
})
