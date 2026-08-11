import { Router } from 'express'
import {
    listMonthNotes,
    createMonthNote,
    updateMonthNote,
    deleteMonthNote,
} from '../controllers/monthNoteController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listMonthNotes)
router.post('/', createMonthNote)
router.put('/:id', updateMonthNote)
router.delete('/:id', deleteMonthNote)

export default router
