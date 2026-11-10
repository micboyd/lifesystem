import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { getFeed, setFeed, syncFeed, deleteFeed, listMeetings } from '../controllers/icalController'

const router = Router()
router.use(requireAuth)

router.get('/', getFeed)
router.put('/', setFeed)
router.post('/sync', syncFeed)
router.get('/meetings', listMeetings)
router.delete('/', deleteFeed)

export default router
