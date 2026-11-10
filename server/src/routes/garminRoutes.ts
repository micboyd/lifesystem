import { Router } from 'express'
import {
    status,
    connect,
    connectMfa,
    disconnect,
    entryStates,
    preview,
    send,
    checkRuns,
    entryRun,
    linkRun,
    unlinkRun,
    pullCalories,
    caloriesToday,
    listSteps,
    pullSteps,
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

router.post('/activities/check', checkRuns)
router.get('/activities/entry/:id', entryRun)
router.post('/activities/entry/:id/link', linkRun)
router.post('/activities/entry/:id/unlink', unlinkRun)

router.post('/daily-energy/pull', pullCalories)
router.get('/daily-energy/today', caloriesToday)

router.get('/steps', listSteps)
router.post('/steps/pull', pullSteps)

export default router
