import { Router } from 'express'
import {
    listLifePlans,
    getLifePlan,
    createLifePlan,
    updateLifePlan,
    deleteLifePlan,
    createSeason,
    updateSeason,
    deleteSeason,
    saveSeasonReview,
} from '../controllers/lifePlanController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listLifePlans)
router.post('/', createLifePlan)
router.get('/:id', getLifePlan)
router.put('/:id', updateLifePlan)
router.delete('/:id', deleteLifePlan)

// Seasons are edited through their plan — they have no life of their own.
router.post('/:id/seasons', createSeason)
router.put('/:id/seasons/:seasonId', updateSeason)
router.delete('/:id/seasons/:seasonId', deleteSeason)
router.put('/:id/seasons/:seasonId/review', saveSeasonReview)

export default router
