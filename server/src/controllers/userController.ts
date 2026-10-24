import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User, {
    TIME_PATTERN,
    IUserSettings,
    SEXES,
    TRAINING_AGES,
    CREATINE_USE,
    PROTEIN_HABITS,
    SLEEP_BANDS,
    ACTIVITY_LEVELS,
    type ITimelineQuiz,
} from '../models/User'
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

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
    return typeof value === 'string' && (list as readonly string[]).includes(value)
}

function adherence(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 1 ? value : null
}

/** A valid quiz answer set, or null when anything required is missing or out of range. */
function cleanTimelineQuiz(q: unknown): ITimelineQuiz | null {
    if (!q || typeof q !== 'object') return null
    const b = q as Record<string, unknown>
    const trainingAdherence = adherence(b.trainingAdherence)
    const nutritionAdherence = adherence(b.nutritionAdherence)
    if (trainingAdherence === null || nutritionAdherence === null) return null
    if (!includes(TRAINING_AGES, b.trainingAge) || !includes(CREATINE_USE, b.creatine)) return null
    if (!includes(PROTEIN_HABITS, b.protein) || !includes(SLEEP_BANDS, b.sleep)) return null
    if (!includes(ACTIVITY_LEVELS, b.activity)) return null

    const cleaned: ITimelineQuiz = {
        trainingAdherence,
        nutritionAdherence,
        trainingAge: b.trainingAge,
        creatine: b.creatine,
        protein: b.protein,
        sleep: b.sleep,
        activity: b.activity,
        // Other settings saves send the whole settings object back, quiz and all,
        // so a valid stamp is kept rather than re-dated on every save.
        answeredAt:
            typeof b.answeredAt === 'string' && !Number.isNaN(Date.parse(b.answeredAt))
                ? b.answeredAt
                : new Date().toISOString(),
    }
    if (b.creatine !== 'no') {
        const dose = b.creatineDoseG
        if (typeof dose === 'number' && Number.isFinite(dose) && dose > 0 && dose <= 30) cleaned.creatineDoseG = dose
    }
    if (b.creatine === 'new') {
        cleaned.creatineLoading = b.creatineLoading === true
        const start = b.creatineStart
        if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start) && !Number.isNaN(Date.parse(start)))
            cleaned.creatineStart = start
    }
    const bf = b.bodyFatPct
    if (typeof bf === 'number' && Number.isFinite(bf) && bf >= 3 && bf <= 60) cleaned.bodyFatPct = bf
    return cleaned
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

    const set: Record<string, unknown> = {}
    const unset: Record<string, 1> = {}
    for (const [k, v] of Object.entries(settings)) {
        if (v === undefined) unset[k] = 1
        else set[k] = v
    }

    // Boolean settings
    if (typeof req.body.showTotals === 'boolean') {
        set['settings.showTotals'] = req.body.showTotals
    }

    // Finance start date: YYYY-MM-DD string or null/'' to clear.
    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
    if (req.body.financeStartDate === null || req.body.financeStartDate === '') {
        unset['settings.financeStartDate'] = 1
    } else if (
        typeof req.body.financeStartDate === 'string' &&
        DATE_PATTERN.test(req.body.financeStartDate)
    ) {
        set['settings.financeStartDate'] = req.body.financeStartDate
    }

    // Monthly savings goal: £ above zero, or null/0 to clear.
    if (req.body.savingsGoal === null || req.body.savingsGoal === 0) {
        unset['settings.savingsGoal'] = 1
    } else if (
        typeof req.body.savingsGoal === 'number' &&
        Number.isFinite(req.body.savingsGoal) &&
        req.body.savingsGoal > 0 &&
        req.body.savingsGoal < 1_000_000
    ) {
        set['settings.savingsGoal'] = Math.round(req.body.savingsGoal * 100) / 100
    }

    // Array settings
    if (Array.isArray(req.body.workDays)) {
        set['settings.workDays'] = req.body.workDays.filter(
            (d: unknown) => typeof d === 'number' && d >= 0 && d <= 6
        )
    }

    // Weather location: an object {name, latitude, longitude}, or null/'' to clear.
    const loc = req.body.weatherLocation
    if (loc === null || loc === '') {
        unset['settings.weatherLocation'] = 1
    } else if (
        loc &&
        typeof loc === 'object' &&
        typeof loc.name === 'string' &&
        loc.name.trim() &&
        typeof loc.latitude === 'number' &&
        typeof loc.longitude === 'number'
    ) {
        set['settings.weatherLocation'] = {
            name: loc.name.trim(),
            latitude: loc.latitude,
            longitude: loc.longitude,
        }
    }

    // Daily macro goals: an object of non-negative numbers, or null/'' to clear.
    // Only fields with a positive value are stored — 0/blank means "no goal".
    const goals = req.body.macroGoals
    if (goals === null || goals === '') {
        unset['settings.macroGoals'] = 1
    } else if (goals && typeof goals === 'object') {
        const cleaned: Record<string, number> = {}
        for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
            const v = goals[key]
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) cleaned[key] = v
        }
        if (Object.keys(cleaned).length) set['settings.macroGoals'] = cleaned
        else unset['settings.macroGoals'] = 1
    }

    // Body goals: { targetWeight, weeklyRate, targetBodyFat }, or null/'' to clear.
    // `weeklyRate` is signed (negative for a cut), so only zero is treated as
    // "no goal"; `targetWeight` must be positive and `targetBodyFat` a percentage.
    const body = req.body.bodyGoals
    if (body === null || body === '') {
        unset['settings.bodyGoals'] = 1
    } else if (body && typeof body === 'object') {
        const cleaned: Record<string, number> = {}
        if (
            typeof body.targetWeight === 'number' &&
            Number.isFinite(body.targetWeight) &&
            body.targetWeight > 0
        )
            cleaned.targetWeight = body.targetWeight
        if (
            typeof body.weeklyRate === 'number' &&
            Number.isFinite(body.weeklyRate) &&
            body.weeklyRate !== 0
        )
            cleaned.weeklyRate = body.weeklyRate
        if (
            typeof body.targetBodyFat === 'number' &&
            Number.isFinite(body.targetBodyFat) &&
            body.targetBodyFat > 0 &&
            body.targetBodyFat <= 100
        )
            cleaned.targetBodyFat = body.targetBodyFat
        if (Object.keys(cleaned).length) set['settings.bodyGoals'] = cleaned
        else unset['settings.bodyGoals'] = 1
    }

    // Body profile: { heightCm, birthDate, sex }, or null/'' to clear. Each
    // field is kept only when it's sensible; the rest are dropped.
    const profile = req.body.bodyProfile
    if (profile === null || profile === '') {
        unset['settings.bodyProfile'] = 1
    } else if (profile && typeof profile === 'object') {
        const cleaned: Record<string, number | string> = {}
        const h = profile.heightCm
        if (typeof h === 'number' && Number.isFinite(h) && h >= 50 && h <= 272) cleaned.heightCm = h
        const dob = profile.birthDate
        if (typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob) && !Number.isNaN(Date.parse(dob)))
            cleaned.birthDate = dob
        if (SEXES.includes(profile.sex)) cleaned.sex = profile.sex
        if (Object.keys(cleaned).length) set['settings.bodyProfile'] = cleaned
        else unset['settings.bodyProfile'] = 1
    }
    // Timeline quiz: replaced whole, or null/'' to clear. An answer set with
    // anything missing or out of range is rejected rather than half-saved.
    const quiz = req.body.timelineQuiz
    if (quiz === null || quiz === '') {
        unset['settings.timelineQuiz'] = 1
    } else if (quiz !== undefined) {
        const cleaned = cleanTimelineQuiz(quiz)
        if (!cleaned) {
            res.status(400).json({ message: 'Timeline quiz answers are incomplete' })
            return
        }
        set['settings.timelineQuiz'] = cleaned
    }

    // The old typed-in BMR — calculated from the body profile now.
    unset['settings.bmr'] = 1

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
