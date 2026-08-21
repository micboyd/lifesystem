import api from './api'
import type {
    ApiResponse,
    ProgressCheckIn,
    ProgressCheckInInput,
    ProgressPhoto,
    PhotoView,
} from '../types'

/**
 * Progress check-ins and photos.
 *
 * Photos are the awkward one. The API takes a bearer token in a header, which an
 * `<img src>` cannot send — so the browser can never fetch one directly, and
 * `photoObjectUrl` pulls the bytes through the authenticated client and wraps
 * them in an object URL instead. That keeps the image behind the same auth as
 * everything else rather than inventing a public or token-in-the-query path to
 * the most personal data in the app.
 */

// ── Check-ins ────────────────────────────────────────────────────────────────

/** Check-ins oldest-first, optionally from `since` (YYYY-MM-DD) onwards. */
export async function listCheckIns(since?: string): Promise<ProgressCheckIn[]> {
    const res = await api.get<ApiResponse<ProgressCheckIn[]>>('/progress-check-ins', {
        params: since ? { since } : undefined,
    })
    return res.data.data
}

/** Record a check-in, replacing any existing one for the same date. */
export async function saveCheckIn(input: ProgressCheckInInput): Promise<ProgressCheckIn> {
    const res = await api.post<ApiResponse<ProgressCheckIn>>('/progress-check-ins', input)
    return res.data.data
}

export async function deleteCheckIn(date: string): Promise<void> {
    await api.delete(`/progress-check-ins/${date}`)
}

// ── Photos ───────────────────────────────────────────────────────────────────

/** Photo metadata oldest-first. Never the images — those are fetched one by one. */
export async function listPhotos(since?: string): Promise<ProgressPhoto[]> {
    const res = await api.get<ApiResponse<ProgressPhoto[]>>('/progress-photos', {
        params: since ? { since } : undefined,
    })
    return res.data.data
}

/** Upload one photo, replacing any existing one for that date and angle. */
export async function savePhoto(
    date: string,
    view: PhotoView,
    image: string
): Promise<ProgressPhoto> {
    const res = await api.post<ApiResponse<ProgressPhoto>>('/progress-photos', {
        date,
        view,
        image,
    })
    return res.data.data
}

export async function deletePhoto(id: string): Promise<void> {
    await api.delete(`/progress-photos/${id}`)
}

/**
 * Fetch a photo's bytes and wrap them in an object URL the browser can render.
 *
 * The caller owns the returned URL and must revoke it when the image comes off
 * screen — otherwise the blob is pinned in memory for the life of the page,
 * which for a comparison view flicking through a year of photos adds up quickly.
 */
export async function photoObjectUrl(id: string): Promise<string> {
    const res = await api.get<Blob>(`/progress-photos/${id}/image`, { responseType: 'blob' })
    return URL.createObjectURL(res.data)
}
