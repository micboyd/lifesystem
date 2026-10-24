import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { listLists, createList, updateList, deleteList } from '../controllers/listController'

const router = Router()
router.use(requireAuth)

router.get('/', listLists)
router.post('/', createList)
router.put('/:id', updateList)
router.delete('/:id', deleteList)

export default router
