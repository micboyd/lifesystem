import { Router } from 'express'
import {
    status,
    connect,
    connectMfa,
    disconnect,
    entryStates,
    preview,
    send,
} from '../controllers/garminController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/status', status)
router.post('/connect', connect)
router.post('/connect/mfa', connectMfa)
router.delete('/connect', disconnect)

router.get('/entries', entryStates)
router.get('/entries/:id/preview', preview)
router.post('/entries/:id/send', send)

export default router
