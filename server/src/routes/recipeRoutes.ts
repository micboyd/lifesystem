import { Router } from 'express'
import {
    listRecipes,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    importRecipes,
    listIngredients,
} from '../controllers/recipeController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', listRecipes)
router.get('/ingredients', listIngredients)
router.post('/', createRecipe)
router.post('/import', importRecipes)
router.put('/:id', updateRecipe)
router.delete('/:id', deleteRecipe)

export default router
