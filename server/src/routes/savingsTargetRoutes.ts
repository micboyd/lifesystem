import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listSavingsTargets, createSavingsTarget, updateSavingsTarget, deleteSavingsTarget,
} from '../controllers/savingsTargetController'

const router = Router()
router.use(requireAuth)

router.get('/', listSavingsTargets)
router.post('/', createSavingsTarget)
router.put('/:id', updateSavingsTarget)
router.delete('/:id', deleteSavingsTarget)

export default router
