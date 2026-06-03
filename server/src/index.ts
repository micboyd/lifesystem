import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })
import express from 'express'
import { connectDB } from './config/db'
import userRoutes from './routes/userRoutes'

const app = express()
const PORT = process.env.PORT ?? 5000

app.use(express.json())

app.use('/api/users', userRoutes)

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
})

connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
})
