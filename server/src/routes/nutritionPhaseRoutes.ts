import { Router } from 'express'
import {
    listNutritionPhases,
    createNutritionPhase,
    updateNutritionPhase,
    deleteNutritionPhase,
    addNutritionPhaseAdjustment,
} from '../controllers/nutritionPhaseController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listNutritionPhases)
router.post('/', createNutritionPhase)
router.put('/:id', updateNutritionPhase)
router.post('/:id/adjustments', addNutritionPhaseAdjustment)
router.delete('/:id', deleteNutritionPhase)

export default router
