import { Router } from 'express'
import {
    listFoodEntries,
    createFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    copyFoodEntries,
    clearPlanned,
} from '../controllers/foodEntryController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listFoodEntries)
router.post('/', createFoodEntry)
router.post('/copy', copyFoodEntries)
router.post('/clear', clearPlanned)
router.patch('/:id', updateFoodEntry)
router.delete('/:id', deleteFoodEntry)

export default router
