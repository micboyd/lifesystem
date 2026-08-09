import { Router } from 'express'
import {
    listPlans,
    getPlan,
    importPlan,
    updatePlan,
    deletePlan,
    applyPlan,
    unapplyPlan,
} from '../controllers/trainingPlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listPlans)
// Kept above the /:id routes so "import" isn't read as a plan id.
router.post('/import', importPlan)

router.get('/:id', getPlan)
router.patch('/:id', updatePlan)
router.delete('/:id', deletePlan)
router.post('/:id/apply', applyPlan)
router.delete('/:id/apply', unapplyPlan)

export default router
