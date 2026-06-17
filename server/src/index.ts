import 'express-async-errors' // routes async rejections to the error middleware below

import type { NextFunction, Request, Response } from 'express'

import DayStatus from './models/DayStatus'
import BudgetSpend from './models/BudgetSpend'
import { connectDB } from './config/db'
import cors from 'cors'
import courseRoutes from './routes/courseRoutes'
import dayStatusRoutes from './routes/dayStatusRoutes'
import dotenv from 'dotenv'
import eventRoutes from './routes/eventRoutes'
import express from 'express'
import financeRoutes from './routes/financeRoutes'
import habitRoutes from './routes/habitRoutes'
import path from 'path'
import taskRoutes from './routes/taskRoutes'
import timeboxRoutes from './routes/timeboxRoutes'
import totalsRoutes from './routes/totalsRoutes'
import userRoutes from './routes/userRoutes'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

// Fail fast at boot if required secrets are missing, rather than 500ing on
// the first request that needs them.
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'] as const
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key])
if (missingEnv.length > 0) {
    console.error(`Missing required environment variables: ${missingEnv.join(', ')}`)
    process.exit(1)
}

const app = express()
const PORT = process.env.PORT ?? 5000

const allowedOrigins = [
    'http://localhost:5173',
    'https://mb-lifesystem.netlify.app',
    'https://adminlife.co',
]

app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())

app.use('/api/users', userRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/habits', habitRoutes)
app.use('/api/day-status', dayStatusRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/timeboxes', timeboxRoutes)
app.use('/api/totals', totalsRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/finances', financeRoutes)

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
})

// Terminal error handler. Thanks to express-async-errors, rejected promises in
// async route handlers reach here too, so a thrown DB error returns a 500
// instead of leaving the request hanging.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    if (res.headersSent) return
    res.status(500).json({ message: 'Something went wrong' })
})

connectDB()
    .then(async () => {
        // One-time migration: drop the old unique { user, date } index from DayStatus
        // (replaced by startDate/endDate in the new schema).
        try {
            await DayStatus.collection.dropIndex('user_1_date_1')
            console.log('DayStatus: dropped stale date index')
        } catch {
            // Index already gone — nothing to do.
        }

        // One-time migration: the daily-spend log moved from one amount per
        // row/day to many transactions, so the old UNIQUE { user, row, date }
        // index must go — otherwise a second transaction on the same day fails.
        try {
            await BudgetSpend.collection.dropIndex('user_1_row_1_date_1')
            console.log('BudgetSpend: dropped stale unique index')
        } catch {
            // Already dropped or never existed.
        }

        app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
    })
    .catch((err) => {
        console.error('Failed to connect to the database:', err)
        process.exit(1)
    })
