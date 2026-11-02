/**
 * Garmin tokens are stored encrypted (AES-256-GCM) with a key that lives only in
 * the environment: GARMIN_TOKEN_KEY, 32 bytes as 64 hex characters or base64.
 * Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { GarminError } from './provider'

function key(): Buffer {
    const raw = process.env.GARMIN_TOKEN_KEY?.trim() ?? ''
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
    if (buf.length !== 32) throw new GarminError('not_configured')
    return buf
}

/** Whether a usable key is set — the settings card says so when it isn't. */
export function encryptionConfigured(): boolean {
    try {
        key()
        return true
    } catch {
        return false
    }
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64. */
export function encrypt(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key(), iv)
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.')
}

export function decrypt(sealed: string): string {
    const [v, iv, tag, body] = sealed.split('.')
    if (v !== 'v1' || !iv || !tag || !body) throw new GarminError('session_expired')
    try {
        const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
        decipher.setAuthTag(Buffer.from(tag, 'base64'))
        return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8')
    } catch (err) {
        if (err instanceof GarminError) throw err
        // Wrong key (rotated) or tampered — the tokens are unusable; reconnect.
        throw new GarminError('session_expired')
    }
}
