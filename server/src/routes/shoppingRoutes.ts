import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    getShopping,
    addToShopping,
    addShoppingItem,
    updateShoppingGroup,
    deleteShoppingGroup,
    tickShopping,
    clearShopping,
} from '../controllers/shoppingController'

const router = Router()
router.use(requireAuth)

router.get('/', getShopping)
router.post('/add', addToShopping)
router.post('/items', addShoppingItem)
router.patch('/groups/:id', updateShoppingGroup)
router.delete('/groups/:id', deleteShoppingGroup)
router.post('/tick', tickShopping)
router.post('/clear', clearShopping)

export default router
