import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listPeople,
    createPerson,
    updatePerson,
    deletePerson,
} from '../controllers/personController'

const router = Router()
router.use(requireAuth)

router.get('/', listPeople)
router.post('/', createPerson)
router.put('/:id', updatePerson)
router.delete('/:id', deletePerson)

export default router
