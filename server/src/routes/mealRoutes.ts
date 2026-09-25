import { Router } from 'express'
import { listMeals, createMeal, updateMeal, deleteMeal, importMeals } from '../controllers/mealController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listMeals)
router.post('/', createMeal)
router.post('/import', importMeals)
router.put('/:id', updateMeal)
router.delete('/:id', deleteMeal)

export default router
