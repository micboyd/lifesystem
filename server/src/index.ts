import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db'
import DayStatus from './models/DayStatus'
import userRoutes from './routes/userRoutes'
import eventRoutes from './routes/eventRoutes'
import habitRoutes from './routes/habitRoutes'
import dayStatusRoutes from './routes/dayStatusRoutes'
import taskRoutes from './routes/taskRoutes'
import timeboxRoutes from './routes/timeboxRoutes'
import totalsRoutes from './routes/totalsRoutes'
import financeRoutes from './routes/financeRoutes'

const app = express()
const PORT = process.env.PORT ?? 5000

const allowedOrigins = [
    'http://localhost:5173',
    'https://mb-lifesystem.netlify.app',
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
app.use('/api/finances', financeRoutes)

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
})

connectDB().then(async () => {
    // One-time migration: drop the old unique { user, date } index from DayStatus
    // (replaced by startDate/endDate in the new schema).
    try {
        await DayStatus.collection.dropIndex('user_1_date_1')
        console.log('DayStatus: dropped stale date index')
    } catch {
        // Index already gone — nothing to do.
    }

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
})
