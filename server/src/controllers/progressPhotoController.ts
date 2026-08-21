import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import ProgressPhoto, {
    ISO_DATE_PATTERN,
    PHOTO_TYPES,
    PHOTO_VIEWS,
    type PhotoView,
} from '../models/ProgressPhoto'

/**
 * The largest image accepted, after the client has downscaled it. A 1,400px JPEG
 * lands well under this; anything above it is an original straight off a phone,
 * which is both wasteful to store and slower to display than it is detailed.
 */
const MAX_BYTES = 3 * 1024 * 1024

function isDate(v: unknown): v is string {
    return typeof v === 'string' && ISO_DATE_PATTERN.test(v)
}

function isObjectBody(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isId(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)
}

/**
 * Pull the bytes and type out of a data URI.
 *
 * The image arrives base64-encoded in JSON rather than as multipart, because the
 * app has no upload middleware and adding one for three photos a month would be
 * more machinery than the feature justifies. The declared type is checked
 * against the allowlist rather than trusted.
 */
function readDataUri(raw: unknown): { data: Buffer; contentType: string } | { error: string } {
    if (typeof raw !== 'string' || !raw.startsWith('data:')) {
        return { error: 'image must be a data URI' }
    }
    const match = /^data:([a-z/+-]+);base64,(.+)$/i.exec(raw)
    if (!match) return { error: 'image must be a base64 data URI' }

    const [, contentType, encoded] = match
    if (!(PHOTO_TYPES as readonly string[]).includes(contentType)) {
        return { error: `image must be one of: ${PHOTO_TYPES.join(', ')}` }
    }

    const data = Buffer.from(encoded, 'base64')
    if (data.length === 0) return { error: 'image is empty' }
    if (data.length > MAX_BYTES) {
        return { error: `image must be under ${Math.round(MAX_BYTES / 1024 / 1024)} MB` }
    }
    return { data, contentType }
}

/**
 * GET /api/progress-photos?since=YYYY-MM-DD — metadata only, oldest first.
 *
 * Never the bytes: this is what builds a timeline, and a year of it should cost
 * a few kilobytes. The images come one at a time from the route below.
 */
export async function listPhotos(req: AuthRequest, res: Response) {
    const { since } = req.query
    const filter: Record<string, unknown> = { user: req.userId }
    if (isDate(since)) filter.date = { $gte: since }

    const photos = await ProgressPhoto.find(filter).sort({ date: 1 }).select('date view contentType bytes createdAt updatedAt')
    res.json({ message: 'OK', data: photos })
}

/**
 * GET /api/progress-photos/:id/image — the image itself.
 *
 * Filtered by owner as well as id, so possessing an id is not enough: a photo
 * belonging to someone else is a 404 rather than a leak. Marked private and
 * no-store so nothing between here and the browser keeps a copy.
 */
export async function getPhotoImage(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Photo not found' })
        return
    }
    const photo = await ProgressPhoto.findOne({ _id: req.params.id, user: req.userId }).select(
        '+data'
    )
    if (!photo) {
        res.status(404).json({ message: 'Photo not found' })
        return
    }

    res.setHeader('Content-Type', photo.contentType)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(photo.data)
}

/**
 * POST /api/progress-photos — upload one photo, replacing any existing one for
 * the same date and angle. One per request: three full-size images in a single
 * body would blow past the JSON limit, and a partial failure would be harder to
 * recover from than a retry of one.
 */
export async function upsertPhoto(req: AuthRequest, res: Response) {
    if (!isObjectBody(req.body)) {
        res.status(400).json({ message: 'a JSON object body is required' })
        return
    }
    const { date, view, image } = req.body

    if (!isDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    if (!(PHOTO_VIEWS as readonly string[]).includes(view as string)) {
        res.status(400).json({ message: `view must be one of: ${PHOTO_VIEWS.join(', ')}` })
        return
    }

    const parsed = readDataUri(image)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }

    const photo = await ProgressPhoto.findOneAndUpdate(
        { user: req.userId, date, view: view as PhotoView },
        {
            $set: {
                contentType: parsed.contentType,
                data: parsed.data,
                bytes: parsed.data.length,
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).select('date view contentType bytes createdAt updatedAt')

    res.status(201).json({ message: 'Saved', data: photo })
}

/**
 * DELETE /api/progress-photos/:id — remove a photo.
 *
 * The bytes live in the document, so deleting the document deletes the image.
 * There is no separate blob left behind to leak or to clean up later.
 */
export async function deletePhoto(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Photo not found' })
        return
    }
    const removed = await ProgressPhoto.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!removed) {
        res.status(404).json({ message: 'Photo not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
