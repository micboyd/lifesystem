import { Router } from 'express'
import {
    listEntries,
    createEntry,
    updateEntry,
    reorderSlot,
    deleteEntry,
    copyWeek,
    clearRange,
    listNotes,
    saveNote,
    deleteNote,
} from '../controllers/fitnessPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listEntries)
router.post('/', createEntry)
router.post('/copy-week', copyWeek)
router.post('/clear', clearRange)
router.put('/reorder', reorderSlot)

// Day / week flag + label notes (kept above the /:id routes so they don't shadow).
router.get('/notes', listNotes)
router.put('/notes', saveNote)
router.delete('/notes/:id', deleteNote)

router.patch('/:id', updateEntry)
router.delete('/:id', deleteEntry)

export default router
