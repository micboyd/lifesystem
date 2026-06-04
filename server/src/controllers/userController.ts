import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User'
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
