import { Router } from 'express'
import {
    listExercises,
    createExercise,
    updateExercise,
    deleteExercise,
    importExercises,
    lastImport,
    undoImport,
} from '../controllers/exerciseController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listExercises)
router.post('/', createExercise)
router.post('/import', importExercises)
router.get('/import/last', lastImport)
router.delete('/import/last', undoImport)
router.put('/:id', updateExercise)
router.delete('/:id', deleteExercise)

export default router
