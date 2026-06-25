import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import WorkStatusBanner from '../components/dashboard/WorkStatusBanner'
import InsightsStrip from '../components/dashboard/InsightsStrip'
import TodayWidget from '../components/dashboard/TodayWidget'
import HabitsWidget from '../components/dashboard/HabitsWidget'
import TasksWidget from '../components/dashboard/TasksWidget'
import TimeboxWidget from '../components/dashboard/TimeboxWidget'
import BudgetWidget from '../components/dashboard/BudgetWidget'
import StudyPacingWidget from '../components/dashboard/StudyPacingWidget'
import BudgetTrendWidget from '../components/dashboard/BudgetTrendWidget'
import DisciplineWidget from '../components/dashboard/DisciplineWidget'
import BirthdayWidget from '../components/dashboard/BirthdayWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import DaysSinceWidget from '../components/dashboard/DaysSinceWidget'
import GoalsWidget from '../components/dashboard/GoalsWidget'
import { todayKey } from '../lib/calendar'

export default function Home() {
    const [date, setDate] = useState(todayKey())

    return (
        <Container as="main" className="py-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            {/* ── Today ── */}
            <section className="mt-8">
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-neutral-400">Today</p>

                <WorkStatusBanner date={date} />
                <BirthdayWidget date={date} />

                <div className="mt-6">
                    <WeatherWidget />
                </div>

                <div className="mt-6">
                    <InsightsStrip date={date} />
                </div>

                <div className="mt-6">
                    <TimeboxWidget date={date} />
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <TodayWidget date={date} />
                    <HabitsWidget date={date} />
                </div>

                <div className="mt-6">
                    <TasksWidget date={date} />
                </div>
            </section>

            {/* ── General ── */}
            <section className="mt-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-neutral-400">General</p>

                <BudgetWidget date={date} />

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <DisciplineWidget date={date} />
                    <BudgetTrendWidget date={date} />
                </div>

                <div className="mt-6">
                    <GoalsWidget />
                </div>

                <div className="mt-6">
                    <DaysSinceWidget />
                </div>

                <div className="mt-6">
                    <StudyPacingWidget />
                </div>
            </section>
        </Container>
    )
}
