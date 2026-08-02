import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listChecklists, createChecklist, updateChecklist, deleteChecklist, resetChecklist,
    addGroup, updateGroup, deleteGroup,
    addItem, updateItem, deleteItem,
} from '../controllers/checklistController'

const router = Router()
router.use(requireAuth)

router.get('/', listChecklists)
router.post('/', createChecklist)
router.put('/:id', updateChecklist)
router.delete('/:id', deleteChecklist)
router.post('/:id/reset', resetChecklist)

router.post('/:id/groups', addGroup)
router.put('/:id/groups/:groupId', updateGroup)
router.delete('/:id/groups/:groupId', deleteGroup)

router.post('/:id/groups/:groupId/items', addItem)
router.put('/:id/groups/:groupId/items/:itemId', updateItem)
router.delete('/:id/groups/:groupId/items/:itemId', deleteItem)

export default router
