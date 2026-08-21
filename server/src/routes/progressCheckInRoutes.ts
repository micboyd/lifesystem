import { Router } from 'express'
import {
    listCheckIns,
    upsertCheckIn,
    deleteCheckIn,
} from '../controllers/progressCheckInController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listCheckIns)
router.post('/', upsertCheckIn)
router.delete('/:date', deleteCheckIn)

export default router
