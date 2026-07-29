import { useState, type ReactNode } from 'react'
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

/** A titled dashboard section: friendly heading + a packed masonry of widgets. */
function Section({
    title,
    hint,
    children,
}: {
    title: string
    hint: string
    children: ReactNode
}) {
    return (
        <section className="mt-10">
            <div className="mb-4 flex items-baseline gap-3">
                <h2 className="text-xl font-extrabold tracking-tight text-neutral-900">{title}</h2>
                <span className="text-sm text-neutral-400">{hint}</span>
            </div>
            <div className="columns-1 gap-6 sm:columns-2 xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
                {children}
            </div>
        </section>
    )
}

export default function Home() {
    const [date, setDate] = useState(todayKey())

    return (
        <Container as="main" fluid className="py-8 sm:py-10">
            {/* Greeting + date nav */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            {/* Featured: today's schedule — the first thing you see. */}
            <div className="mt-8">
                <TodayWidget date={date} />
            </div>

            {/* The rest of today */}
            <Section title="On your plate" hint="what needs you today">
                <TimeboxWidget date={date} />
                <TasksWidget date={date} />
                <RemindersWidget date={date} />
                <HabitsWidget date={date} />
            </Section>

            {/* Context that shapes the day */}
            <Section title="Good to know" hint="weather, money & moments">
                <WeatherWidget />
                <BudgetWidget date={date} />
                <BirthdayWidget date={date} />
            </Section>

            {/* Longer-horizon trackers */}
            <Section title="The bigger picture" hint="goals & streaks">
                <GoalsWidget />
                <DaysSinceWidget />
                <DisciplineWidget date={date} />
            </Section>
        </Container>
    )
}
