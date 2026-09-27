import { describe, expect, it } from 'vitest'
import { parseJsonc, stripJsonComments } from './jsonc'

describe('parseJsonc', () => {
    it('drops line and block comments', () => {
        const text = `{
            // the plan's name
            "a": 1, /* inline */ "b": [2, 3] // trailing
        }`
        expect(parseJsonc(text)).toEqual({ a: 1, b: [2, 3] })
    })

    it('leaves comment-like text inside strings alone', () => {
        expect(parseJsonc('{ "url": "https://x.io/a", "s": "a /* b */ c" }')).toEqual({
            url: 'https://x.io/a',
            s: 'a /* b */ c',
        })
    })

    it('handles escaped quotes in strings', () => {
        expect(parseJsonc('{ "q": "say \\"hi\\" // not a comment" }')).toEqual({
            q: 'say "hi" // not a comment',
        })
    })

    it('drops trailing commas, but not commas inside strings', () => {
        expect(parseJsonc('{ "a": [1, 2,], "b": "x, ]", }')).toEqual({ a: [1, 2], b: 'x, ]' })
    })

    it('still throws on broken JSON', () => {
        expect(() => parseJsonc('{ "a": }')).toThrow()
    })

    it('passes plain JSON through untouched', () => {
        expect(stripJsonComments('{"a":1}')).toBe('{"a":1}')
    })
})
