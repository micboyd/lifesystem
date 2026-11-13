import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    photoStatus,
    listPhotos,
    signUpload,
    createPhoto,
    updatePhoto,
    deletePhoto,
} from '../controllers/progressPhotoController'

const router = Router()
router.use(requireAuth)

router.get('/status', photoStatus)
router.get('/', listPhotos)
router.post('/sign', signUpload)
router.post('/', createPhoto)
router.put('/:id', updatePhoto)
router.delete('/:id', deletePhoto)

export default router
