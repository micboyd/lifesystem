import { Router } from 'express'
import { listPlateFoods, createPlateFood, updatePlateFood, deletePlateFood } from '../controllers/plateFoodController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listPlateFoods)
router.post('/', createPlateFood)
router.put('/:id', updatePlateFood)
router.delete('/:id', deletePlateFood)

export default router
