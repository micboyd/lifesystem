import { describe, expect, it } from 'vitest'
import { embedUrl, parseVideo } from './video'

const ID = 'dQw4w9WgXcQ'

describe('parseVideo', () => {
    it('reads the usual YouTube link shapes', () => {
        for (const url of [
            `https://www.youtube.com/watch?v=${ID}`,
            `https://m.youtube.com/watch?v=${ID}&feature=share`,
            `https://youtu.be/${ID}`,
            `https://youtu.be/${ID}?si=abc`,
            `https://www.youtube.com/embed/${ID}`,
        ]) {
            expect(parseVideo(url)).toMatchObject({ kind: 'youtube', id: ID, vertical: false })
        }
    })

    it('frames Shorts portrait', () => {
        expect(parseVideo(`https://youtube.com/shorts/${ID}`)).toMatchObject({
            kind: 'youtube',
            id: ID,
            vertical: true,
        })
    })

    it('keeps a start time', () => {
        expect(parseVideo(`https://youtu.be/${ID}?t=90`)).toMatchObject({ start: 90 })
        expect(parseVideo(`https://www.youtube.com/watch?v=${ID}&t=1m5s`)).toMatchObject({
            start: 65,
        })
    })

    it('treats other web links as plain links, and junk as nothing', () => {
        expect(parseVideo('https://vimeo.com/123')).toEqual({
            kind: 'link',
            url: 'https://vimeo.com/123',
        })
        expect(parseVideo('not a link')).toBeNull()
        expect(parseVideo('javascript:alert(1)')).toBeNull()
        expect(parseVideo('')).toBeNull()
    })
})

describe('embedUrl', () => {
    it('uses the privacy-enhanced player, inline, with the start time', () => {
        const v = parseVideo(`https://youtu.be/${ID}?t=30`)
        if (v?.kind !== 'youtube') throw new Error('expected youtube')
        const url = embedUrl(v)
        expect(url).toContain(`youtube-nocookie.com/embed/${ID}?`)
        expect(url).toContain('playsinline=1')
        expect(url).toContain('start=30')
    })
})
