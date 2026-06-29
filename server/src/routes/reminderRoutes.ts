import { Router } from 'express'
import {
    listReminders,
    createReminder,
    updateReminder,
    deleteReminder,
} from '../controllers/reminderController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listReminders)
router.post('/', createReminder)
router.put('/:id', updateReminder)
router.delete('/:id', deleteReminder)

export default router
