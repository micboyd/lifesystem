import { Router } from 'express'
import {
    listGroups, createGroup, updateGroup, deleteGroup,
    listRows, createRow, updateRow, deleteRow,
    listEntries, setEntry,
} from '../controllers/financeController'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// Groups
router.get('/groups', listGroups)
router.post('/groups', createGroup)
router.put('/groups/:id', updateGroup)
router.delete('/groups/:id', deleteGroup)

// Rows
router.get('/rows', listRows)
router.post('/rows', createRow)
router.put('/rows/:id', updateRow)
router.delete('/rows/:id', deleteRow)

// Entries
router.get('/entries', listEntries)
router.put('/entries/:rowId/:month', setEntry)

export default router
