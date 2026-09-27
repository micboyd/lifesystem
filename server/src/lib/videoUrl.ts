/**
 * An exercise's demo video link. Plans and imports can attach one to an
 * exercise so the app can show how the movement is done, in the gym, from the
 * exercise's card. Read under a few names, since a plan is often written by
 * hand or by an LLM: `videoUrl`, `youtubeLink`, `youtube` or `video`.
 */

/** An http(s) link, trimmed — or undefined for anything else. */
export function toVideoUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined
    const t = raw.trim()
    if (!t) return undefined
    try {
        const u = new URL(t)
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined
    } catch {
        return undefined
    }
}

/** The video link on an imported row, under any of the names it's read as. */
export function readVideoUrl(o: Record<string, unknown>): string | undefined {
    return toVideoUrl(o.videoUrl ?? o.youtubeLink ?? o.youtube ?? o.video)
}
