import { Router } from 'express'
import {
    listWorkouts,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    importWorkouts,
    previewImportWorkouts,
    lastImport,
    undoImport,
} from '../controllers/workoutController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listWorkouts)
router.post('/', createWorkout)
router.post('/import/preview', previewImportWorkouts)
router.post('/import', importWorkouts)
router.get('/import/last', lastImport)
router.delete('/import/last', undoImport)
router.put('/:id', updateWorkout)
router.delete('/:id', deleteWorkout)

export default router
