import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import TodayWidget from '../components/dashboard/TodayWidget'
import TasksWidget from '../components/dashboard/TasksWidget'
import BudgetWidget from '../components/dashboard/BudgetWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import TomorrowWidget from '../components/dashboard/TomorrowWidget'
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

            {/* Today's schedule — the core of the day. */}
            <div className="mt-8">
                <TodayWidget date={date} />
            </div>

            {/* A few essentials. Left: weather then money. Right: tomorrow's prep
                (evening only) above tasks. */}
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
                <div className="grid gap-6">
                    <WeatherWidget />
                    <BudgetWidget date={date} />
                </div>
                <div className="grid gap-6">
                    <TomorrowWidget date={date} />
                    <TasksWidget date={date} />
                </div>
            </div>
        </Container>
    )
}
