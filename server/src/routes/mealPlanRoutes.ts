import { Router } from 'express'
import {
    listEntries,
    createEntry,
    updateEntryStatus,
    copyEntries,
    clearRange,
    deleteEntry,
} from '../controllers/mealPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listEntries)
router.post('/', createEntry)
router.post('/copy', copyEntries)
router.post('/clear', clearRange)
router.patch('/:id', updateEntryStatus)
router.delete('/:id', deleteEntry)

export default router
