import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listDailyEnergy,
    upsertDailyEnergy,
    deleteDailyEnergy,
} from '../controllers/dailyEnergyController'

const router = Router()
router.use(requireAuth)

router.get('/', listDailyEnergy)
router.post('/', upsertDailyEnergy)
router.delete('/:date', deleteDailyEnergy)

export default router
