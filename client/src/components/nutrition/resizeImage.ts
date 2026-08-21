/**
 * Downscale a chosen photo before it is uploaded.
 *
 * A modern phone produces 4–8 MB images at resolutions no progress comparison
 * needs. Sending those would blow past the API's body limit, fill the database
 * with detail nobody looks at, and make the comparison view slow to page
 * through. 1,400 pixels on the long edge is more than enough to see a waistline
 * change and lands in the low hundreds of kilobytes.
 *
 * Done in the browser so the original never leaves the device at full size.
 * Re-encoding to JPEG also drops the EXIF block, which on a phone photo carries
 * GPS coordinates — worth losing on a picture of yourself in your kitchen.
 */

/** Longest edge of the stored image, in pixels. */
export const MAX_EDGE = 1400

/** JPEG quality. High enough that compression isn't visible at this size. */
export const QUALITY = 0.82

/**
 * Read a file, downscale it, and return a JPEG data URI ready to POST.
 *
 * Rejects rather than silently passing the original through: an upload that
 * quietly sent a 6 MB file would fail at the API with a much less helpful error.
 */
export async function resizeImage(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
        throw new Error('That file is not an image.')
    }

    const bitmap = await loadBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that image.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    // Release the decoded frame promptly — these are large, and a monthly check
    // may put three of them through in a row.
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

    return canvas.toDataURL('image/jpeg', QUALITY)
}

/**
 * Decode a file to something drawable. `createImageBitmap` is the direct route
 * and handles EXIF orientation, so a portrait photo doesn't arrive on its side;
 * the `<img>` path is the fallback for browsers without it.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' })
        } catch {
            // Fall through to the <img> route below.
        }
    }

    const url = URL.createObjectURL(file)
    try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('Could not read that image.'))
            img.src = url
        })
    } finally {
        URL.revokeObjectURL(url)
    }
}
