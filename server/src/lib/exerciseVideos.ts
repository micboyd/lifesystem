import { Types } from 'mongoose'
import Exercise from '../models/Exercise'

/**
 * Attach demo video links to library exercises after an import has resolved
 * them. A link fills in an exercise that has none; one that already has a
 * video keeps it unless `overwrite` is set (the import's "update existing").
 * Returns how many exercises changed.
 */
export async function applyExerciseVideos(
    userId: string,
    links: { id: string; url: string }[],
    overwrite = false
): Promise<number> {
    let changed = 0
    for (const { id, url } of links) {
        if (!Types.ObjectId.isValid(id)) continue
        const filter = overwrite
            ? { _id: id, user: userId }
            : {
                  _id: id,
                  user: userId,
                  $or: [{ videoUrl: '' }, { videoUrl: { $exists: false } }],
              }
        const r = await Exercise.updateOne(filter, { $set: { videoUrl: url } })
        changed += r.modifiedCount
    }
    return changed
}
