import { Router } from 'express'
import { listTasks, createTask, updateTask, deleteTask } from '../controllers/taskController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listTasks)
router.post('/', createTask)
router.put('/:id', updateTask)
router.delete('/:id', deleteTask)

export default router
