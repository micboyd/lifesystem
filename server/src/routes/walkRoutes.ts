import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listWalks,
    getWalk,
    namePoint,
    createWalk,
    updateWalk,
    setWalkDone,
    deleteWalk,
    generateWalkRoute,
    completeWalkRoute,
    findPlaces,
} from '../controllers/walkController'

const router = Router()
router.use(requireAuth)

router.get('/', listWalks)
router.get('/places', findPlaces)
router.get('/places/name', namePoint)
router.get('/:id', getWalk)
router.post('/route', generateWalkRoute)
router.post('/route/complete', completeWalkRoute)
router.post('/', createWalk)
router.put('/:id/done', setWalkDone)
router.put('/:id', updateWalk)
router.delete('/:id', deleteWalk)

export default router
