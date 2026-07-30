import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import TodayWidget from '../components/dashboard/TodayWidget'
import TasksWidget from '../components/dashboard/TasksWidget'
import BudgetWidget from '../components/dashboard/BudgetWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import TomorrowWidget, { useTomorrowVisible } from '../components/dashboard/TomorrowWidget'
import NextTimeOffWidget from '../components/dashboard/NextTimeOffWidget'
import BirthdayWidget from '../components/dashboard/BirthdayWidget'
import HabitsWidget from '../components/dashboard/HabitsWidget'
import { todayKey } from '../lib/calendar'

export default function Home() {
    const [date, setDate] = useState(todayKey())
    const { show: showTomorrow } = useTomorrowVisible(date)

    return (
        <Container as="main" className="py-8 sm:py-10">
            {/* Greeting + date nav */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            {/* Today's schedule — the core of the day. */}
            <section className="mt-8">
                <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-neutral-400">
                    Today&apos;s outlook
                </h2>
                <TodayWidget date={date} />
            </section>

            {/* In the evening, the tomorrow-prep brief spans full width directly
                under the day's schedule — it's the natural next thing to act on. */}
            {showTomorrow && (
                <div className="mt-6">
                    <TomorrowWidget date={date} />
                </div>
            )}

            {/* A few essentials. Left: today's tasks with today's weather beneath.
                Right: the budget and habits. */}
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
                <div className="grid gap-6">
                    <TasksWidget date={date} />
                    <WeatherWidget variant="hourly" />
                </div>
                <div className="grid gap-6">
                    <HabitsWidget date={date} />
                    <BudgetWidget date={date} cadence="today" />
                </div>
            </div>

            {/* The week's weather sits at the bottom — a glance ahead, not a
                thing you act on right now. */}
            <section className="mt-10">
                <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-neutral-400">
                    Looking ahead
                </h2>
                <div className="grid items-start gap-6 lg:grid-cols-2">
                    <BudgetWidget date={date} cadence="week" />
                    <WeatherWidget variant="daily" />
                    <NextTimeOffWidget date={date} />
                    <BirthdayWidget date={date} />
                </div>
            </section>
        </Container>
    )
}
