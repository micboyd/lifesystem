import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listCategories, createCategory, updateCategory, deleteCategory,
    listNotes, createNote, updateNote, deleteNote,
} from '../controllers/noteController'

const router = Router()
router.use(requireAuth)

// Categories — declared before the note `/:id` routes so "categories" is never
// captured as a note id.
router.get('/categories', listCategories)
router.post('/categories', createCategory)
router.put('/categories/:id', updateCategory)
router.delete('/categories/:id', deleteCategory)

router.get('/', listNotes)
router.post('/', createNote)
router.put('/:id', updateNote)
router.delete('/:id', deleteNote)

export default router
