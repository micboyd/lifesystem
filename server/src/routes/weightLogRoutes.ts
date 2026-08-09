import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listWeightLogs,
    upsertWeightLog,
    deleteWeightLog,
} from '../controllers/weightLogController'

const router = Router()
router.use(requireAuth)

router.get('/', listWeightLogs)
router.post('/', upsertWeightLog)
router.delete('/:id', deleteWeightLog)

export default router
