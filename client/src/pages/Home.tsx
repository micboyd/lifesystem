import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import WorkStatusBanner from '../components/dashboard/WorkStatusBanner'
import TodayWidget from '../components/dashboard/TodayWidget'
import HabitsWidget from '../components/dashboard/HabitsWidget'
import TasksWidget from '../components/dashboard/TasksWidget'
import TimeboxWidget from '../components/dashboard/TimeboxWidget'
import { todayKey } from '../lib/calendar'

export default function Home() {
    const [date, setDate] = useState(todayKey())

    return (
        <Container as="main" className="py-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            <div className="mt-8">
                <WorkStatusBanner date={date} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <TodayWidget date={date} />
                <HabitsWidget date={date} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <TimeboxWidget date={date} />
                <TasksWidget date={date} />
            </div>
        </Container>
    )
}
