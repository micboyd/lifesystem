import { Router } from 'express'
import {
    listRecovery,
    createRecovery,
    updateRecovery,
    deleteRecovery,
} from '../controllers/recoveryController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listRecovery)
router.post('/', createRecovery)
router.put('/:id', updateRecovery)
router.delete('/:id', deleteRecovery)

export default router
