import { Router } from 'express'
import {
    listNutritionPhases,
    createNutritionPhase,
    updateNutritionPhase,
    deleteNutritionPhase,
} from '../controllers/nutritionPhaseController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listNutritionPhases)
router.post('/', createNutritionPhase)
router.put('/:id', updateNutritionPhase)
router.delete('/:id', deleteNutritionPhase)

export default router
