import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import TodayWidget from '../components/dashboard/TodayWidget'
import TasksWidget from '../components/dashboard/TasksWidget'
import BudgetWidget from '../components/dashboard/BudgetWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import { todayKey } from '../lib/calendar'

export default function Home() {
    const [date, setDate] = useState(todayKey())

    return (
        <Container as="main" fluid className="py-8 sm:py-10">
            {/* Greeting + date nav */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            <p className="mt-4 max-w-2xl text-sm text-neutral-500">
                A quick look at today — open any module from the sidebar for the full detail.
            </p>

            {/* Today's schedule — the core of the day. */}
            <div className="mt-6">
                <TodayWidget date={date} />
            </div>

            {/* A few essentials: weather, money, tasks. */}
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
                <WeatherWidget />
                <div className="grid gap-6">
                    <BudgetWidget date={date} />
                    <TasksWidget date={date} />
                </div>
            </div>
        </Container>
    )
}
