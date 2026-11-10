import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { getFeed, setFeed, syncFeed, deleteFeed } from '../controllers/icalController'

const router = Router()
router.use(requireAuth)

router.get('/', getFeed)
router.put('/', setFeed)
router.post('/sync', syncFeed)
router.delete('/', deleteFeed)

export default router
