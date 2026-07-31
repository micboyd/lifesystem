import { Router } from 'express'
import { listEntries, createEntry, deleteEntry } from '../controllers/fitnessPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listEntries)
router.post('/', createEntry)
router.delete('/:id', deleteEntry)

export default router
