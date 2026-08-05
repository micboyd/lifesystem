import { Router } from 'express'
import {
    listRecovery,
    createRecovery,
    importRecovery,
    updateRecovery,
    deleteRecovery,
    lastImport,
    undoImport,
} from '../controllers/recoveryController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listRecovery)
router.post('/', createRecovery)
router.post('/import', importRecovery)
router.get('/import/last', lastImport)
router.delete('/import/last', undoImport)
router.put('/:id', updateRecovery)
router.delete('/:id', deleteRecovery)

export default router
