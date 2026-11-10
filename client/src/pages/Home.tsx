import { useState } from 'react'
import Container from '../components/Container'
import { DashCards } from '../components/dashboard/DashSection'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import YourDayWidget from '../components/dashboard/YourDayWidget'
import TomorrowWidget, { useTomorrowVisible } from '../components/dashboard/TomorrowWidget'
import TimelineWidget from '../components/dashboard/TimelineWidget'
import StepsWidget from '../components/dashboard/StepsWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import CountdownsWidget from '../components/dashboard/CountdownsWidget'
import BirthdaysWidget from '../components/dashboard/BirthdaysWidget'
import { todayKey } from '../lib/calendar'

/**
 * The day on one page, most important first. A greeting; Your day's score and
 * targets in one strip; then the plan — what's happening now and the day in
 * order — with steps and the weather beside it, since they shape the day. Then,
 * quieter, a row of things to glance at: the timeline, countdowns, and
 * birthdays when one is close. Every section sits on its own card.
 */
export default function Home() {
    const [date, setDate] = useState(todayKey())
    const { show: showTomorrow } = useTomorrowVisible(date)

    return (
        <Container as="main" wide className="pb-20 pt-8 sm:pt-12">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            <DashCards>
                <div className="mt-8 sm:mt-10">
                    <YourDayWidget
                        date={date}
                        aside={
                            <>
                                <StepsWidget />
                                <WeatherWidget />
                            </>
                        }
                    />
                </div>

                {/* Evenings only: tonight's prep for tomorrow, across the whole page. */}
                {showTomorrow && (
                    <div className="mt-5">
                        <TomorrowWidget date={date} />
                    </div>
                )}

                <div className="mt-5 grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
                    <TimelineWidget />
                    <CountdownsWidget />
                    <BirthdaysWidget date={date} />
                </div>
            </DashCards>
        </Container>
    )
}
