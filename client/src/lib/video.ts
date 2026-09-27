/**
 * Exercise demo videos. A link is usually YouTube — a watch page, a youtu.be
 * share link, a Short or an embed — which plays inside the app; any other web
 * link opens in a new tab.
 */

export type Video =
    | {
          kind: 'youtube'
          id: string
          /** Where to start, in seconds, from a `t=` / `start=` in the link. */
          start?: number
          /** A Short — portrait, so it's framed 9:16 rather than 16:9. */
          vertical: boolean
          /** The link as given, for "Open in YouTube". */
          url: string
      }
    | { kind: 'link'; url: string }

const ID = /^[A-Za-z0-9_-]{11}$/

/** "1m30s" / "90s" / "90" → 90. */
function toSeconds(raw: string | null): number | undefined {
    if (!raw) return undefined
    if (/^\d+$/.test(raw)) return Number(raw)
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw)
    if (!m || !m[0]) return undefined
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Read a video link, or null when it isn't a usable web link. */
export function parseVideo(raw: string | undefined | null): Video | null {
    const text = raw?.trim()
    if (!text) return null
    let u: URL
    try {
        u = new URL(text)
    } catch {
        return null
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null

    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '')
    let id: string | null = null
    let vertical = false
    if (host === 'youtu.be') {
        id = u.pathname.slice(1).split('/')[0]
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        const [, first, second] = u.pathname.split('/')
        if (first === 'watch') id = u.searchParams.get('v')
        else if (first === 'shorts') {
            id = second
            vertical = true
        } else if (first === 'embed' || first === 'live' || first === 'v') id = second
    }
    if (id && ID.test(id)) {
        const start = toSeconds(u.searchParams.get('t') ?? u.searchParams.get('start'))
        return { kind: 'youtube', id, vertical, url: text, ...(start ? { start } : {}) }
    }
    return { kind: 'link', url: text }
}

/**
 * The in-app player URL for a YouTube video: the privacy-enhanced domain, no
 * related videos from other channels, and inline playback on iPhone.
 */
export function embedUrl(v: Extract<Video, { kind: 'youtube' }>): string {
    const params = new URLSearchParams({ rel: '0', playsinline: '1', modestbranding: '1' })
    if (v.start) params.set('start', String(v.start))
    return `https://www.youtube-nocookie.com/embed/${v.id}?${params}`
}
