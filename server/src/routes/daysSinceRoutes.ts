import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listDaysSince,
    createDaysSince,
    updateDaysSince,
    deleteDaysSince,
} from '../controllers/daysSinceController'

const router = Router()
router.use(requireAuth)

router.get('/', listDaysSince)
router.post('/', createDaysSince)
router.put('/:id', updateDaysSince)
router.delete('/:id', deleteDaysSince)

export default router
