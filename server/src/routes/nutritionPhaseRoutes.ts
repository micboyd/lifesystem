import { Router } from 'express'
import {
    listNutritionPhases,
    createNutritionPhase,
    updateNutritionPhase,
    deleteNutritionPhase,
    deleteAllNutritionPhases,
    addNutritionPhaseAdjustment,
    importNutritionPhases,
    lastImport,
    undoImport,
} from '../controllers/nutritionPhaseController'
import { applyMenu, getApplied, saveMenu, unapplyMenu } from '../controllers/nutritionMenuController'
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
router.put('/:id/menu', saveMenu)
router.get('/:id/applied', getApplied)
router.post('/:id/apply', applyMenu)
router.post('/:id/unapply', unapplyMenu)
router.delete('/', deleteAllNutritionPhases)
router.delete('/:id', deleteNutritionPhase)

export default router
