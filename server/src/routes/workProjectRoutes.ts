import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listProjects,
    createProject,
    updateProject,
    deleteProject,
} from '../controllers/workProjectController'

const router = Router()
router.use(requireAuth)

router.get('/', listProjects)
router.post('/', createProject)
router.put('/:id', updateProject)
router.delete('/:id', deleteProject)

export default router
