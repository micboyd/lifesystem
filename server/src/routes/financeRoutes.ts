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
    listPaid,
    setPaid,
    listPots,
    createPot,
    updatePot,
    deletePot,
} from '../controllers/financeController'
import {
    listBudgetSpends,
    createBudgetSpend,
    updateBudgetSpend,
    moveBudgetSpend,
    deleteBudgetSpend,
} from '../controllers/budgetSpendController'
import { listBudgetExclusions, setBudgetExclusion } from '../controllers/budgetExclusionController'
import {
    listStarlingSpaces,
    syncStarlingRow,
    getStarlingReconciliation,
} from '../controllers/starlingController'
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

// Paid state
router.get('/paid', listPaid)
router.put('/paid/:rowId/:month', setPaid)

// Budget daily spends (transactions — many per row per day)
router.get('/budget-spends', listBudgetSpends)
router.post('/budget-spends', createBudgetSpend)
router.put('/budget-spends/:id', updateBudgetSpend)
router.put('/budget-spends/:id/move', moveBudgetSpend)
router.delete('/budget-spends/:id', deleteBudgetSpend)

// Budget day exclusions
router.get('/budget-exclusions', listBudgetExclusions)
router.put('/budget-exclusions/:date', setBudgetExclusion)

// Starling Bank — link a budget to a Space and pull its transactions
router.get('/starling/spaces', listStarlingSpaces)
router.post('/starling/sync', syncStarlingRow)
router.get('/starling/reconcile', getStarlingReconciliation)

// Pots (sub-groups within a group)
router.get('/pots', listPots)
router.post('/pots', createPot)
router.put('/pots/:id', updatePot)
router.delete('/pots/:id', deletePot)

// Row breakdown sub-items
router.get('/sub-items', listSubItems)
router.post('/sub-items', createSubItem)
router.put('/sub-items/:id', updateSubItem)
router.delete('/sub-items/:id', deleteSubItem)

export default router
