import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listTasks,
    createTask,
    updateTask,
    deleteTask,
    nudgeTask,
} from '../controllers/workTaskController'

const router = Router()
router.use(requireAuth)

router.get('/', listTasks)
router.post('/', createTask)
router.put('/:id', updateTask)
router.post('/:id/nudge', nudgeTask)
router.delete('/:id', deleteTask)

export default router
