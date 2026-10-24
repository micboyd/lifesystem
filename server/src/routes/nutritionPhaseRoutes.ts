import { Router } from 'express'
import {
    listNutritionPhases,
    createNutritionPhase,
    updateNutritionPhase,
    deleteNutritionPhase,
    addNutritionPhaseAdjustment,
    importNutritionPhases,
    lastImport,
    undoImport,
} from '../controllers/nutritionPhaseController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listNutritionPhases)
router.post('/', createNutritionPhase)
router.post('/import', importNutritionPhases)
router.get('/import/last', lastImport)
router.delete('/import/last', undoImport)
router.put('/:id', updateNutritionPhase)
router.post('/:id/adjustments', addNutritionPhaseAdjustment)
router.delete('/:id', deleteNutritionPhase)

export default router
