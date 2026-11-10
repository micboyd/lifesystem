import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listTimeboxes,
    createTimebox,
    importTimeboxes,
    updateTimebox,
    deleteTimebox,
} from '../controllers/timeboxController'

const router = Router()
router.use(requireAuth)

router.get('/', listTimeboxes)
router.post('/', createTimebox)
router.post('/import', importTimeboxes)
router.put('/:id', updateTimebox)
router.delete('/:id', deleteTimebox)

export default router
