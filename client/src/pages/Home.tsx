import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import WorkStatusBanner from '../components/dashboard/WorkStatusBanner'
import StatusOverviewStrip from '../components/dashboard/StatusOverviewStrip'
import InsightsStrip from '../components/dashboard/InsightsStrip'
import TodayWidget from '../components/dashboard/TodayWidget'
import RemindersWidget from '../components/dashboard/RemindersWidget'
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
        <Container as="main" fluid className="py-8">
            {/* Top bar */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            {/* Full-width status + at-a-glance KPIs */}
            <div className="mt-6 flex flex-col gap-4">
                <WorkStatusBanner date={date} />
                <StatusOverviewStrip />
                <InsightsStrip date={date} />
            </div>

            {/*
              Packed masonry board. Widgets are direct children so any that render
              null (e.g. Timebox/Birthday when empty) leave no gap — `[&>*]:mb-6`
              only applies to elements that actually render.
            */}
            <div className="mt-6 columns-1 gap-6 md:columns-2 xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
                <WeatherWidget />
                <BirthdayWidget date={date} />
                <RemindersWidget date={date} />
                <TimeboxWidget date={date} />
                <TodayWidget date={date} />
                <HabitsWidget date={date} />
                <TasksWidget date={date} />
                <BudgetWidget date={date} />
                <DisciplineWidget date={date} />
                <BudgetTrendWidget date={date} />
                <GoalsWidget />
                <DaysSinceWidget />
                <StudyPacingWidget />
            </div>
        </Container>
    )
}
