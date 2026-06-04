import { Router } from 'express'
import { listEvents, createEvent, updateEvent, deleteEvent } from '../controllers/eventController'
import { requireAuth } from '../middleware/auth'

const router = Router()

// Every event route is scoped to the signed-in user.
router.use(requireAuth)

router.get('/', listEvents)
router.post('/', createEvent)
router.put('/:id', updateEvent)
router.delete('/:id', deleteEvent)

export default router
