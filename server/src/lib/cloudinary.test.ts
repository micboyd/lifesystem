import { describe, it, expect, afterEach } from 'vitest'
import { signParams, signedImageUrl, cloudinaryConfig } from './cloudinary'

describe('cloudinary signing', () => {
    afterEach(() => {
        delete process.env.CLOUDINARY_URL
    })

    it('matches the worked example in the Cloudinary docs', () => {
        expect(
            signParams(
                {
                    timestamp: 1315060510,
                    public_id: 'sample_image',
                    eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
                },
                'abcd'
            )
        ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e')
    })

    it('leaves empty params out of the signature', () => {
        expect(signParams({ a: '1', b: '', c: undefined }, 's')).toBe(signParams({ a: '1' }, 's'))
    })

    it('builds an authenticated URL with the version outside the signature', () => {
        const cfg = { cloudName: 'demo', apiKey: 'k', apiSecret: 'abcd' }
        const a = signedImageUrl(cfg, 'body/x', 'jpg', 'w_10', 1)
        const b = signedImageUrl(cfg, 'body/x', 'jpg', 'w_10', 2)
        expect(a).toMatch(
            /^https:\/\/res\.cloudinary\.com\/demo\/image\/authenticated\/s--[\w-]{8}--\/w_10\/v1\/body\/x\.jpg$/
        )
        expect(a.split('/')[6]).toBe(b.split('/')[6])
    })

    it('reads CLOUDINARY_URL', () => {
        process.env.CLOUDINARY_URL = 'cloudinary://123:sec@mycloud'
        expect(cloudinaryConfig()).toEqual({
            apiKey: '123',
            apiSecret: 'sec',
            cloudName: 'mycloud',
        })
    })
})
