import { Router } from 'express'
import {
    listSessions,
    createSession,
    updateSession,
    deleteSession,
    importSessions,
} from '../controllers/conditioningController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listSessions)
router.post('/', createSession)
router.post('/import', importSessions)
router.put('/:id', updateSession)
router.delete('/:id', deleteSession)

export default router
