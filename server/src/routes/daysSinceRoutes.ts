import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listDaysSince,
    createDaysSince,
    updateDaysSince,
    deleteDaysSince,
    resetDaysSince,
    listCheckIns,
    upsertCheckIn,
} from '../controllers/daysSinceController'

const router = Router()
router.use(requireAuth)

router.get('/', listDaysSince)
router.post('/', createDaysSince)
router.get('/checkins', listCheckIns)
router.put('/:id', updateDaysSince)
router.delete('/:id', deleteDaysSince)
router.post('/:id/reset', resetDaysSince)
router.post('/:id/checkins', upsertCheckIn)

export default router
