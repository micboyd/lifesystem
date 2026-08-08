import { Router } from 'express'
import { listLogs, createLog, updateLog, deleteLog } from '../controllers/recoveryLogController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listLogs)
router.post('/', createLog)
router.put('/:id', updateLog)
router.delete('/:id', deleteLog)

export default router
