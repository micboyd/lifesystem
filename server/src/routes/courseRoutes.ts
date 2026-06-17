import { Router } from 'express'
import {
    listCourses,
    createCourse,
    updateCourse,
    deleteCourse,
} from '../controllers/courseController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listCourses)
router.post('/', createCourse)
router.put('/:id', updateCourse)
router.delete('/:id', deleteCourse)

export default router
