import { Router } from 'express'
import {
    listHabits,
    createHabit,
    updateHabit,
    deleteHabit,
    listLogs,
    setLog,
    removeLog,
} from '../controllers/habitController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// Logs route must come before /:id to avoid "logs" being parsed as an id
router.get('/logs', listLogs)

// Definitions
router.get('/', listHabits)
router.post('/', createHabit)
router.put('/:id', updateHabit)
router.delete('/:id', deleteHabit)

// Per-habit log for a specific date
router.put('/:id/logs/:date', setLog)
router.delete('/:id/logs/:date', removeLog)

export default router
