import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listBirthdays,
    createBirthday,
    updateBirthday,
    deleteBirthday,
} from '../controllers/birthdayController'

const router = Router()
router.use(requireAuth)

router.get('/', listBirthdays)
router.post('/', createBirthday)
router.put('/:id', updateBirthday)
router.delete('/:id', deleteBirthday)

export default router
