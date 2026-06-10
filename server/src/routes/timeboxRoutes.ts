import { Router } from 'express'
import {
    listTimeboxes,
    createTimebox,
    updateTimebox,
    deleteTimebox,
} from '../controllers/timeboxController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listTimeboxes)
router.post('/', createTimebox)
router.put('/:id', updateTimebox)
router.delete('/:id', deleteTimebox)

export default router
