import { Router } from 'express'
import {
    listSessions,
    createSession,
    updateSession,
    deleteSession,
    importSessions,
    lastImport,
    undoImport,
} from '../controllers/conditioningController'
import {
    listGroups,
    createGroup,
    updateGroup,
    deleteGroup,
} from '../controllers/conditioningGroupController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// Categories sit above the bare `/:id` routes so "groups" is never read as an id.
router.get('/groups', listGroups)
router.post('/groups', createGroup)
router.put('/groups/:id', updateGroup)
router.delete('/groups/:id', deleteGroup)

router.get('/', listSessions)
router.post('/', createSession)
router.post('/import', importSessions)
router.get('/import/last', lastImport)
router.delete('/import/last', undoImport)
router.put('/:id', updateSession)
router.delete('/:id', deleteSession)

export default router
