import { Router } from 'express'
import {
    listPlateFoods,
    createPlateFood,
    updatePlateFood,
    deletePlateFood,
    importTrays,
    lastImport,
    undoImport,
} from '../controllers/plateFoodController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listPlateFoods)
router.post('/', createPlateFood)
router.post('/import', importTrays)
router.get('/import/last', lastImport)
router.delete('/import/last', undoImport)
router.put('/:id', updatePlateFood)
router.delete('/:id', deletePlateFood)

export default router
