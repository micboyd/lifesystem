import { Router } from 'express'
import { listCooks, createCook, updateCook, deleteCook } from '../controllers/boxCookController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listCooks)
router.post('/', createCook)
router.patch('/:id', updateCook)
router.delete('/:id', deleteCook)

export default router
