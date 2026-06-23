import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listGoals, createGoal, updateGoal, deleteGoal,
    addMilestone, updateMilestone, deleteMilestone,
} from '../controllers/goalController'

const router = Router()
router.use(requireAuth)

router.get('/', listGoals)
router.post('/', createGoal)
router.put('/:id', updateGoal)
router.delete('/:id', deleteGoal)

router.post('/:id/milestones', addMilestone)
router.put('/:id/milestones/:milestoneId', updateMilestone)
router.delete('/:id/milestones/:milestoneId', deleteMilestone)

export default router
