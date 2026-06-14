import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User, { TIME_PATTERN, IUserSettings } from '../models/User'
import { AuthRequest } from '../middleware/auth'

export async function register(req: Request, res: Response) {
    const { name, email, password } = req.body
    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({ name, email, password: hashed })
    res.status(201).json({ message: 'User created', data: { _id: user._id, email: user.email } })
}

export async function login(req: Request, res: Response) {
    const { email, password } = req.body
    const user = await User.findOne({ email })
    if (!user || !(await bcrypt.compare(password, user.password))) {
        res.status(401).json({ message: 'Invalid credentials' })
        return
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    res.json({ message: 'Login successful', data: { token } })
}

export async function getMe(req: AuthRequest, res: Response) {
    const user = await User.findById(req.userId).select('-password')
    if (!user) {
        res.status(404).json({ message: 'User not found' })
        return
    }
    res.json({ message: 'OK', data: user })
}

/** PUT /api/users/me — update the signed-in user's name and/or email. */
export async function updateMe(req: AuthRequest, res: Response) {
    const update: Record<string, string> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim())
        update.name = req.body.name.trim()
    if (typeof req.body.email === 'string' && req.body.email.trim()) {
        const email = req.body.email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ message: 'Enter a valid email address' })
            return
        }
        update.email = email
    }
    if (Object.keys(update).length === 0) {
        res.status(400).json({ message: 'Nothing to update' })
        return
    }

    try {
        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: update },
            { new: true }
        ).select('-password')
        if (!user) {
            res.status(404).json({ message: 'User not found' })
            return
        }
        res.json({ message: 'Saved', data: user })
    } catch (err) {
        if ((err as { code?: number }).code === 11000) {
            res.status(409).json({ message: 'That email is already in use' })
            return
        }
        throw err
    }
}

/** PUT /api/users/me/settings — update general settings (times, etc.). */
export async function updateSettings(req: AuthRequest, res: Response) {
    const keys: (keyof IUserSettings)[] = ['wakeTime', 'bedTime', 'workStart', 'workEnd']
    const settings: Record<string, string | undefined> = {}

    for (const key of keys) {
        const value = req.body[key]
        if (value === null || value === '') {
            settings[`settings.${key}`] = undefined // cleared
        } else if (typeof value === 'string') {
            if (!TIME_PATTERN.test(value)) {
                res.status(400).json({ message: `${key} must be HH:MM` })
                return
            }
            settings[`settings.${key}`] = value
        }
    }

    const set: Record<string, string | boolean> = {}
    const unset: Record<string, 1> = {}
    for (const [k, v] of Object.entries(settings)) {
        if (v === undefined) unset[k] = 1
        else set[k] = v
    }

    // Boolean settings
    if (typeof req.body.showTotals === 'boolean') {
        set['settings.showTotals'] = req.body.showTotals
    }

    // Array settings
    if (Array.isArray(req.body.workDays)) {
        set['settings.workDays'] = req.body.workDays.filter(
            (d: unknown) => typeof d === 'number' && d >= 0 && d <= 6
        )
    }

    const user = await User.findByIdAndUpdate(
        req.userId,
        {
            ...(Object.keys(set).length ? { $set: set } : {}),
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true }
    ).select('-password')

    if (!user) {
        res.status(404).json({ message: 'User not found' })
        return
    }
    res.json({ message: 'Saved', data: user })
}

/** PUT /api/users/me/password — change the signed-in user's password. */
export async function changePassword(req: AuthRequest, res: Response) {
    const { currentPassword, newPassword } = req.body
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(400).json({ message: 'New password must be at least 6 characters' })
        return
    }
    const user = await User.findById(req.userId)
    if (!user) {
        res.status(404).json({ message: 'User not found' })
        return
    }
    if (
        !(await bcrypt.compare(
            typeof currentPassword === 'string' ? currentPassword : '',
            user.password
        ))
    ) {
        res.status(401).json({ message: 'Current password is incorrect' })
        return
    }
    user.password = await bcrypt.hash(newPassword, 10)
    await user.save()
    res.json({ message: 'Password updated' })
}
