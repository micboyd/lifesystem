import { Router } from 'express'
import { register, login, getMe, updateMe, updateSettings, changePassword } from '../controllers/userController'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.get('/me', requireAuth, getMe)
router.put('/me', requireAuth, updateMe)
router.put('/me/settings', requireAuth, updateSettings)
router.put('/me/password', requireAuth, changePassword)

export default router
