import { Router } from 'express'
import {
    listPhotos,
    getPhotoImage,
    upsertPhoto,
    deletePhoto,
} from '../controllers/progressPhotoController'
import { requireAuth } from '../middleware/auth'

const router = Router()
// Every route, including the image itself — these are the most personal records
// in the app and none of them is reachable without a token.
router.use(requireAuth)

router.get('/', listPhotos)
router.get('/:id/image', getPhotoImage)
router.post('/', upsertPhoto)
router.delete('/:id', deletePhoto)

export default router
