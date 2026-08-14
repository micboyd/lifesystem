import { Router } from 'express'
import {
    listPlans,
    getPlan,
    exportPlan,
    importPlan,
    updatePlan,
    deletePlan,
    applyPlan,
    unapplyPlan,
    movePlanScheduleEntry,
} from '../controllers/trainingPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listPlans)
// Kept above the /:id routes so "import" isn't read as a plan id.
router.post('/import', importPlan)

router.get('/:id', getPlan)
router.get('/:id/export', exportPlan)
router.patch('/:id', updatePlan)
router.patch('/:id/schedule', movePlanScheduleEntry)
router.delete('/:id', deletePlan)
router.post('/:id/apply', applyPlan)
router.delete('/:id/apply', unapplyPlan)

export default router
