import { Router } from 'express'
import { listEntries, createEntry, updateEntry, deleteEntry, reorderSlot, copyWeek, clearRange, createBoxNotes } from '../controllers/mealPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listEntries)
router.post('/', createEntry)
router.post('/reorder', reorderSlot)
router.post('/box', createBoxNotes)
router.post('/copy-week', copyWeek)
router.post('/clear', clearRange)
router.patch('/:id', updateEntry)
router.delete('/:id', deleteEntry)

export default router
