import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import YourDayWidget from '../components/dashboard/YourDayWidget'
import TomorrowWidget, { useTomorrowVisible } from '../components/dashboard/TomorrowWidget'
import TimelineWidget from '../components/dashboard/TimelineWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import CountdownsWidget from '../components/dashboard/CountdownsWidget'
import BirthdaysWidget from '../components/dashboard/BirthdaysWidget'
import { todayKey } from '../lib/calendar'

/**
 * The day on one open page, most important first. A greeting, then Your day —
 * training, meals, habits and targets, in order, and what to do next — which
 * is the one place today lives. Then, quieter, a row of things to glance at:
 * the timeline, the weather, countdowns, and birthdays when one is close.
 */
export default function Home() {
    const [date, setDate] = useState(todayKey())
    const { show: showTomorrow } = useTomorrowVisible(date)

    return (
        <Container as="main" className="pb-20 pt-8 sm:pt-14">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            <div className="mt-10 sm:mt-12">
                <YourDayWidget date={date} />
            </div>

            {/* Evenings only: tonight's prep for tomorrow, across the whole page. */}
            {showTomorrow && (
                <div className="mt-14 sm:mt-16">
                    <TomorrowWidget date={date} />
                </div>
            )}

            <div className="mt-14 grid gap-x-12 gap-y-12 border-t border-neutral-200 pt-12 sm:mt-16 md:grid-cols-2 lg:grid-cols-3">
                <TimelineWidget />
                <WeatherWidget />
                <CountdownsWidget />
                <BirthdaysWidget date={date} />
            </div>
        </Container>
    )
}
