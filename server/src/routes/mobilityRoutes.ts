import { Router } from 'express'
import {
    listMobility,
    createMobility,
    updateMobility,
    deleteMobility,
    importMobility,
} from '../controllers/mobilityController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listMobility)
router.post('/', createMobility)
router.post('/import', importMobility)
router.put('/:id', updateMobility)
router.delete('/:id', deleteMobility)

export default router
