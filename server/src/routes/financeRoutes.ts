import { Router } from 'express'
import {
    listGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    listRows,
    createRow,
    updateRow,
    deleteRow,
    listEntries,
    setEntry,
} from '../controllers/financeController'
import {
    listBudgetSpends,
    createBudgetSpend,
    updateBudgetSpend,
    deleteBudgetSpend,
} from '../controllers/budgetSpendController'
import { listBudgetExclusions, setBudgetExclusion } from '../controllers/budgetExclusionController'
import {
    listSubItems,
    createSubItem,
    updateSubItem,
    deleteSubItem,
} from '../controllers/financeSubItemController'
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

// Budget daily spends (transactions — many per row per day)
router.get('/budget-spends', listBudgetSpends)
router.post('/budget-spends', createBudgetSpend)
router.put('/budget-spends/:id', updateBudgetSpend)
router.delete('/budget-spends/:id', deleteBudgetSpend)

// Budget day exclusions
router.get('/budget-exclusions', listBudgetExclusions)
router.put('/budget-exclusions/:date', setBudgetExclusion)

// Row breakdown sub-items
router.get('/sub-items', listSubItems)
router.post('/sub-items', createSubItem)
router.put('/sub-items/:id', updateSubItem)
router.delete('/sub-items/:id', deleteSubItem)

export default router
