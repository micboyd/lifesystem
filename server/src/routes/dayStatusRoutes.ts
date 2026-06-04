import { Router } from 'express'
import { listStatuses, createStatus, updateStatus, deleteStatus } from '../controllers/dayStatusController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listStatuses)
router.post('/', createStatus)
router.put('/:id', updateStatus)
router.delete('/:id', deleteStatus)

export default router
