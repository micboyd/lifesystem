import { useState } from 'react'
import Container from '../components/Container'
import { DashCards } from '../components/dashboard/DashSection'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import YourDayWidget from '../components/dashboard/YourDayWidget'
import TomorrowWidget, { useTomorrowVisible } from '../components/dashboard/TomorrowWidget'
import TimelineWidget from '../components/dashboard/TimelineWidget'
import StepsWidget, { StepsGlance } from '../components/dashboard/StepsWidget'
import { useSteps } from '../components/dashboard/useSteps'
import CaloriesOutWidget from '../components/dashboard/CaloriesOutWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import CountdownsWidget from '../components/dashboard/CountdownsWidget'
import BirthdaysWidget from '../components/dashboard/BirthdaysWidget'
import { todayKey } from '../lib/calendar'

/**
 * The day on one page, most important first. A greeting; Your day's score and
 * targets in one strip; then the plan — what's happening now and the day in
 * order — with the weather beside it, since it shapes the day. Then steps and
 * calories burned side by side, and, quieter, a row of things to glance
 * at: the timeline, countdowns, and birthdays when one is close. Every section sits on its own card.
 */
export default function Home() {
    const [date, setDate] = useState(todayKey())
    const { show: showTomorrow } = useTomorrowVisible(date)
    // Read once here: the summary strip and the steps card both show them.
    const steps = useSteps(todayKey())

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
                        glance={date === todayKey() ? <StepsGlance data={steps} /> : undefined}
                        aside={<WeatherWidget />}
                    />
                </div>

                {/* Evenings only: tonight's prep for tomorrow, across the whole page. */}
                {showTomorrow && (
                    <div className="mt-5">
                        <TomorrowWidget date={date} />
                    </div>
                )}

                {/* Activity from the watch, side by side so neither pushes the page down. */}
                <div className="mt-5 grid items-start gap-5 md:grid-cols-2">
                    <StepsWidget data={steps} />
                    <CaloriesOutWidget />
                </div>

                <div className="mt-5 grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
                    <TimelineWidget />
                    <CountdownsWidget show="until" />
                    <CountdownsWidget show="since" />
                    <BirthdaysWidget date={date} />
                </div>
            </DashCards>
        </Container>
    )
}
