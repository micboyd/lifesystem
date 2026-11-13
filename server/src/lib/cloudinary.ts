import crypto from 'crypto'

/**
 * Cloudinary without the SDK: signed direct uploads, signed delivery URLs and
 * deletes. Body photos are private, so every image is stored with
 * `type: authenticated` — the plain URL 401s, and the only way to view one is a
 * URL this server has signed with the API secret.
 *
 * Credentials come from CLOUDINARY_URL (cloudinary://key:secret@cloud) or the
 * three separate CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET variables.
 */

export interface CloudinaryConfig {
    cloudName: string
    apiKey: string
    apiSecret: string
}

/** Every progress photo lives under this folder in the Cloudinary account. */
export const PHOTO_FOLDER = 'lifesystem/body'

export function cloudinaryConfig(): CloudinaryConfig | null {
    const url = process.env.CLOUDINARY_URL
    if (url) {
        const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim())
        if (m) return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] }
    }
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET
    if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret }
    return null
}

/**
 * The API-request signature: params sorted by key, joined as k=v with &, the
 * secret appended, SHA-1 hex. Empty values are left out, as Cloudinary does.
 */
export function signParams(
    params: Record<string, string | number | undefined>,
    apiSecret: string
): string {
    const toSign = Object.keys(params)
        .filter((k) => params[k] !== undefined && params[k] !== '')
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&')
    return crypto
        .createHash('sha1')
        .update(toSign + apiSecret)
        .digest('hex')
}

/**
 * What the browser needs to upload one photo straight to Cloudinary. Uploading
 * direct keeps multi-megabyte phone photos off Heroku (30s cap, 5mb body limit).
 */
export function uploadSignature(cfg: CloudinaryConfig, userId: string) {
    const timestamp = Math.floor(Date.now() / 1000)
    const params = {
        folder: `${PHOTO_FOLDER}/${userId}`,
        timestamp,
        type: 'authenticated',
    }
    return {
        ...params,
        apiKey: cfg.apiKey,
        cloudName: cfg.cloudName,
        signature: signParams(params, cfg.apiSecret),
    }
}

/**
 * A signed delivery URL for an authenticated image. The signature covers the
 * transformation and the public id (with extension) but not the version — the
 * first 8 chars of URL-safe base64 SHA-1 over that path plus the secret.
 */
export function signedImageUrl(
    cfg: CloudinaryConfig,
    publicId: string,
    format: string,
    transformation: string,
    version?: number
): string {
    const source = `${publicId}.${format}`
    const toSign = transformation ? `${transformation}/${source}` : source
    const sig = crypto
        .createHash('sha1')
        .update(toSign + cfg.apiSecret)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .slice(0, 8)
    const parts = [`s--${sig}--`, transformation, version ? `v${version}` : '', source].filter(
        Boolean
    )
    return `https://res.cloudinary.com/${cfg.cloudName}/image/authenticated/${parts.join('/')}`
}

/** Thumbnail and full-size URLs for one stored photo. */
export function photoUrls(
    cfg: CloudinaryConfig,
    photo: { publicId: string; format: string; version?: number }
) {
    // JPG rather than f_auto: the format has to be fixed for the signature, and
    // every browser (and HEIC uploads from an iPhone) ends up displayable.
    return {
        thumbUrl: signedImageUrl(
            cfg,
            photo.publicId,
            'jpg',
            'c_fill,g_auto,h_533,q_auto,w_400',
            photo.version
        ),
        url: signedImageUrl(
            cfg,
            photo.publicId,
            'jpg',
            'c_limit,h_1600,q_auto,w_1600',
            photo.version
        ),
    }
}

/** Remove an image from Cloudinary. A missing image counts as removed. */
export async function destroyImage(cfg: CloudinaryConfig, publicId: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000)
    const params = { public_id: publicId, timestamp, type: 'authenticated', invalidate: 'true' }
    const body = new URLSearchParams({
        ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        api_key: cfg.apiKey,
        signature: signParams(params, cfg.apiSecret),
    })
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/destroy`, {
        method: 'POST',
        body,
    })
    if (!res.ok) throw new Error(`Cloudinary destroy failed (${res.status})`)
    const json = (await res.json()) as { result?: string }
    if (json.result !== 'ok' && json.result !== 'not found') {
        throw new Error(`Cloudinary destroy failed (${json.result})`)
    }
}
