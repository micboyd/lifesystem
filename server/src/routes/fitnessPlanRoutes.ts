import { Router } from 'express'
import {
    listEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    copyWeek,
} from '../controllers/fitnessPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listEntries)
router.post('/', createEntry)
router.post('/copy-week', copyWeek)
router.patch('/:id', updateEntry)
router.delete('/:id', deleteEntry)

export default router
