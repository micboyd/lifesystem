import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
    listWalks,
    getWalk,
    listLibrary,
    getLibraryItem,
    createLibraryItem,
    updateLibraryItem,
    deleteLibraryItem,
    assignLibraryItem,
    listFavourites,
    createFavourite,
    deleteFavourite,
    namePoint,
    createWalk,
    updateWalk,
    setWalkDone,
    deleteWalk,
    generateWalkRoute,
    completeWalkRoute,
    findPlaces,
} from '../controllers/walkController'

const router = Router()
router.use(requireAuth)

router.get('/', listWalks)
router.get('/places', findPlaces)
router.get('/places/name', namePoint)
router.get('/library', listLibrary)
router.post('/library', createLibraryItem)
router.get('/library/:id', getLibraryItem)
router.put('/library/:id', updateLibraryItem)
router.delete('/library/:id', deleteLibraryItem)
router.post('/library/:id/assign', assignLibraryItem)
router.get('/favourites', listFavourites)
router.post('/favourites', createFavourite)
router.delete('/favourites/:id', deleteFavourite)
router.get('/:id', getWalk)
router.post('/route', generateWalkRoute)
router.post('/route/complete', completeWalkRoute)
router.post('/', createWalk)
router.put('/:id/done', setWalkDone)
router.put('/:id', updateWalk)
router.delete('/:id', deleteWalk)

export default router
