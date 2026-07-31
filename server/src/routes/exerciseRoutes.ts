import { Router } from 'express'
import {
    listExercises,
    createExercise,
    updateExercise,
    deleteExercise,
    importExercises,
} from '../controllers/exerciseController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listExercises)
router.post('/', createExercise)
router.post('/import', importExercises)
router.put('/:id', updateExercise)
router.delete('/:id', deleteExercise)

export default router
