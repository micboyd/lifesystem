import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import ProgressPhoto, {
    PHOTO_KINDS,
    PHOTO_POSES,
    type IProgressPhoto,
    type PhotoKind,
    type PhotoPose,
} from '../models/ProgressPhoto'
import {
    cloudinaryConfig,
    destroyImage,
    photoUrls,
    uploadSignature,
    PHOTO_FOLDER,
    type CloudinaryConfig,
} from '../lib/cloudinary'

const DATE = /^\d{4}-\d{2}-\d{2}$/

function notConfigured(res: Response) {
    res.status(503).json({
        message: 'Photos need Cloudinary — add CLOUDINARY_URL to the server environment.',
    })
}

/** The stored photo plus freshly signed URLs to view it. */
function withUrls(cfg: CloudinaryConfig, p: IProgressPhoto) {
    return { ...p.toObject(), ...photoUrls(cfg, p) }
}

/** Whether photos can be used at all — lets the UI explain instead of failing. */
export async function photoStatus(_req: AuthRequest, res: Response) {
    res.json({ message: 'OK', data: { configured: cloudinaryConfig() !== null } })
}

export async function listPhotos(req: AuthRequest, res: Response) {
    const cfg = cloudinaryConfig()
    if (!cfg) return notConfigured(res)
    const photos = await ProgressPhoto.find({ user: req.userId }).sort({ date: 1, createdAt: 1 })
    res.json({ message: 'OK', data: photos.map((p) => withUrls(cfg, p)) })
}

/** A short-lived signature for one direct browser → Cloudinary upload. */
export async function signUpload(req: AuthRequest, res: Response) {
    const cfg = cloudinaryConfig()
    if (!cfg) return notConfigured(res)
    res.json({ message: 'OK', data: uploadSignature(cfg, req.userId!) })
}

/** Record a photo the browser has just uploaded. */
export async function createPhoto(req: AuthRequest, res: Response) {
    const cfg = cloudinaryConfig()
    if (!cfg) return notConfigured(res)
    const { kind, pose, date, publicId, format, version, width, height, note } = req.body ?? {}

    if (!PHOTO_KINDS.includes(kind)) return void res.status(400).json({ message: 'Bad kind' })
    if (!PHOTO_POSES.includes(pose)) return void res.status(400).json({ message: 'Bad pose' })
    if (typeof date !== 'string' || !DATE.test(date))
        return void res.status(400).json({ message: 'date must be YYYY-MM-DD' })
    // Only accept images uploaded into this user's own folder.
    if (typeof publicId !== 'string' || !publicId.startsWith(`${PHOTO_FOLDER}/${req.userId}/`))
        return void res.status(400).json({ message: 'Bad publicId' })
    if (typeof format !== 'string' || !/^[a-z0-9]+$/i.test(format))
        return void res.status(400).json({ message: 'Bad format' })

    const photo = await ProgressPhoto.create({
        user: req.userId,
        kind: kind as PhotoKind,
        pose: pose as PhotoPose,
        date,
        publicId,
        format,
        version: Number.isFinite(version) ? version : undefined,
        width: Number.isFinite(width) ? width : undefined,
        height: Number.isFinite(height) ? height : undefined,
        note: typeof note === 'string' && note.trim() ? note.trim() : undefined,
    })
    res.status(201).json({ message: 'Created', data: withUrls(cfg, photo) })
}

/** Change a photo's details — kind, pose, date, note. The image stays put. */
export async function updatePhoto(req: AuthRequest, res: Response) {
    const cfg = cloudinaryConfig()
    if (!cfg) return notConfigured(res)
    const fields: Record<string, unknown> = {}
    const unset: Record<string, 1> = {}
    const { kind, pose, date, note } = req.body ?? {}
    if (PHOTO_KINDS.includes(kind)) fields.kind = kind
    if (PHOTO_POSES.includes(pose)) fields.pose = pose
    if (typeof date === 'string' && DATE.test(date)) fields.date = date
    if (typeof note === 'string') {
        if (note.trim()) fields.note = note.trim()
        else unset.note = 1
    }
    const photo = await ProgressPhoto.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { new: true }
    )
    if (!photo) return void res.status(404).json({ message: 'Photo not found' })
    res.json({ message: 'Saved', data: withUrls(cfg, photo) })
}

/** Delete the record and the image in Cloudinary with it. */
export async function deletePhoto(req: AuthRequest, res: Response) {
    const cfg = cloudinaryConfig()
    if (!cfg) return notConfigured(res)
    const photo = await ProgressPhoto.findOne({ _id: req.params.id, user: req.userId })
    if (!photo) return void res.status(404).json({ message: 'Photo not found' })
    await destroyImage(cfg, photo.publicId)
    await photo.deleteOne()
    res.json({ message: 'Deleted', data: null })
}
