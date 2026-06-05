import { Router } from 'express'
import { listRows, createRow, updateRow, deleteRow, listValues, setValue } from '../controllers/totalsController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// Values routes must come before '/:id' so 'values' isn't treated as an id.
router.get('/values', listValues)
router.put('/:id/values/:date', setValue)

router.get('/', listRows)
router.post('/', createRow)
router.put('/:id', updateRow)
router.delete('/:id', deleteRow)

export default router
