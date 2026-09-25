import { Router } from 'express'
import { listBatches, createBatch, updateBatch, deleteBatch } from '../controllers/batchController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listBatches)
router.post('/', createBatch)
router.patch('/:id', updateBatch)
router.delete('/:id', deleteBatch)

export default router
