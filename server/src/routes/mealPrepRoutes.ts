import { Router } from 'express'
import {
    listRecipes,
    importRecipes,
    lastRecipeImport,
    undoRecipeImport,
    createRecipe,
    updateRecipe,
    duplicateRecipe,
    archiveRecipe,
    listBatches,
    cookBatch,
    updateBatch,
    adjustBatch,
    listMovements,
    listFoods,
    createFood,
    updateFood,
    archiveFood,
    listContainers,
    createContainer,
    deleteContainer,
} from '../controllers/mealPrepController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/recipes', listRecipes)
router.post('/recipes', createRecipe)
router.post('/recipes/import', importRecipes)
router.get('/recipes/import/last', lastRecipeImport)
router.delete('/recipes/import/last', undoRecipeImport)
router.put('/recipes/:id', updateRecipe)
router.post('/recipes/:id/duplicate', duplicateRecipe)
router.delete('/recipes/:id', archiveRecipe)

router.get('/batches', listBatches)
router.post('/batches', cookBatch)
router.patch('/batches/:id', updateBatch)
router.post('/batches/:id/adjust', adjustBatch)
router.get('/batches/:id/movements', listMovements)

router.get('/foods', listFoods)
router.post('/foods', createFood)
router.put('/foods/:id', updateFood)
router.delete('/foods/:id', archiveFood)

router.get('/containers', listContainers)
router.post('/containers', createContainer)
router.delete('/containers/:id', deleteContainer)

export default router
