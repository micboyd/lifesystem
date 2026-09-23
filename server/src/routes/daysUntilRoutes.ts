import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listDaysUntil,
    createDaysUntil,
    updateDaysUntil,
    deleteDaysUntil,
} from '../controllers/daysUntilController'

const router = Router()
router.use(requireAuth)

router.get('/', listDaysUntil)
router.post('/', createDaysUntil)
router.put('/:id', updateDaysUntil)
router.delete('/:id', deleteDaysUntil)

export default router
