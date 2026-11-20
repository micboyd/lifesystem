import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { getCleaningHome, saveCleaningHome, sendToTimebox } from '../controllers/cleaningController'

const router = Router()
router.use(requireAuth)

router.get('/', getCleaningHome)
router.put('/', saveCleaningHome)
router.post('/timebox', sendToTimebox)

export default router
