import User from '../models/User'
import bcrypt from 'bcryptjs'
import { connectDB } from '../config/db'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

const TEST_USER = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
}

async function seed() {
    await connectDB()

    const existing = await User.findOne({ email: TEST_USER.email })
    if (existing) {
        console.log(`Test user already exists: ${TEST_USER.email}`)
    } else {
        const hashed = await bcrypt.hash(TEST_USER.password, 10)
        await User.create({ name: TEST_USER.name, email: TEST_USER.email, password: hashed })
        console.log(`Created test user: ${TEST_USER.email}`)
    }

    console.log(`\n  Email:    ${TEST_USER.email}`)
    console.log(`  Password: ${TEST_USER.password}\n`)

    await mongoose.disconnect()
}

seed().catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
})
