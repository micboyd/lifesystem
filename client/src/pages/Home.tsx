import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import TodayWidget from '../components/dashboard/TodayWidget'
import RemindersWidget from '../components/dashboard/RemindersWidget'
import HabitsWidget from '../components/dashboard/HabitsWidget'
import TasksWidget from '../components/dashboard/TasksWidget'
import TimeboxWidget from '../components/dashboard/TimeboxWidget'
import BudgetWidget from '../components/dashboard/BudgetWidget'
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

            {/* Featured: today's schedule — the first thing you see. */}
            <div className="mt-6">
                <TodayWidget date={date} />
            </div>

            {/*
              Supporting widgets in priority order: the rest of "today" (schedule,
              tasks, reminders, habits), then day-shaping context (weather, money,
              birthdays), then longer-horizon trackers. Direct children so any that
              render null when empty (Timebox/Reminders/Birthday) leave no gap.
            */}
            <div className="mt-6 columns-1 gap-6 md:columns-2 xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
                <TimeboxWidget date={date} />
                <TasksWidget date={date} />
                <RemindersWidget date={date} />
                <HabitsWidget date={date} />
                <WeatherWidget />
                <BudgetWidget date={date} />
                <BirthdayWidget date={date} />
                <GoalsWidget />
                <DaysSinceWidget />
                <DisciplineWidget date={date} />
            </div>
        </Container>
    )
}
