import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listCalendars,
    createCalendar,
    updateCalendar,
    deleteCalendar,
} from '../controllers/calendarController'

const router = Router()
router.use(requireAuth)

router.get('/', listCalendars)
router.post('/', createCalendar)
router.put('/:id', updateCalendar)
router.delete('/:id', deleteCalendar)

export default router
