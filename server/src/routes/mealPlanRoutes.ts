import { Router } from 'express'
import { listEntries, createEntry, copyEntries, deleteEntry } from '../controllers/mealPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listEntries)
router.post('/', createEntry)
router.post('/copy', copyEntries)
router.delete('/:id', deleteEntry)

export default router
