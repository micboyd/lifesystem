import api from './api'
import type { ApiResponse, PhotoKind, PhotoPose, ProgressPhoto } from '../types'

export interface PhotoDetails {
    kind: PhotoKind
    pose: PhotoPose
    date: string
    note?: string
}

interface UploadSignature {
    cloudName: string
    apiKey: string
    timestamp: number
    signature: string
    folder: string
    type: string
}

/** Whether the server has Cloudinary credentials. */
export async function photosConfigured(): Promise<boolean> {
    const res = await api.get<ApiResponse<{ configured: boolean }>>('/progress-photos/status')
    return res.data.data.configured
}

export async function listPhotos(): Promise<ProgressPhoto[]> {
    const res = await api.get<ApiResponse<ProgressPhoto[]>>('/progress-photos')
    return res.data.data
}

/**
 * Upload straight from the browser to Cloudinary with a server-made signature,
 * then record it. The file never passes through our own server.
 */
export async function uploadPhoto(file: File, details: PhotoDetails): Promise<ProgressPhoto> {
    const sig = (await api.post<ApiResponse<UploadSignature>>('/progress-photos/sign')).data.data

    const form = new FormData()
    form.append('file', file)
    form.append('api_key', sig.apiKey)
    form.append('timestamp', String(sig.timestamp))
    form.append('signature', sig.signature)
    form.append('folder', sig.folder)
    form.append('type', sig.type)

    const up = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
        method: 'POST',
        body: form,
    })
    const json = await up.json()
    if (!up.ok) throw new Error(json?.error?.message ?? 'Upload failed')

    const res = await api.post<ApiResponse<ProgressPhoto>>('/progress-photos', {
        ...details,
        publicId: json.public_id,
        format: json.format,
        version: json.version,
        width: json.width,
        height: json.height,
    })
    return res.data.data
}

export async function updatePhoto(id: string, details: PhotoDetails): Promise<ProgressPhoto> {
    const res = await api.put<ApiResponse<ProgressPhoto>>(`/progress-photos/${id}`, {
        ...details,
        note: details.note ?? '',
    })
    return res.data.data
}

export async function deletePhoto(id: string): Promise<void> {
    await api.delete(`/progress-photos/${id}`)
}
