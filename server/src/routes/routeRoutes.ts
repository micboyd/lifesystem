import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    getSettings,
    setHome,
    listRoutes,
    generate,
    choose,
    unchoose,
    report,
    deleteRoute,
} from '../controllers/routeController'

const router = Router()
router.use(requireAuth)

router.get('/settings', getSettings)
router.put('/settings/home', setHome)
router.get('/', listRoutes)
router.post('/generate', generate)
router.put('/:id/choose', choose)
router.put('/:id/unchoose', unchoose)
router.post('/:id/report', report)
router.delete('/:id', deleteRoute)

export default router
