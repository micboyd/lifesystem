import { useState } from 'react'
import Container from '../components/Container'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import AtAGlance from '../components/dashboard/AtAGlance'
import TodayWidget, { useDayEvents } from '../components/dashboard/TodayWidget'
import TomorrowWidget, { useTomorrowVisible } from '../components/dashboard/TomorrowWidget'
import HabitsWidget from '../components/dashboard/HabitsWidget'
import FitnessWidget from '../components/dashboard/FitnessWidget'
import NutritionWidget, { useNutritionToday } from '../components/dashboard/NutritionWidget'
import WeatherWidget from '../components/dashboard/WeatherWidget'
import CountdownsWidget from '../components/dashboard/CountdownsWidget'
import { useBudgetToday } from '../components/dashboard/useBudgetToday'
import { todayKey } from '../lib/calendar'

/**
 * The day on one open page. A large greeting, then four figures on a hairline
 * band, then what to act on (left) and what to glance at (right) as boxless
 * sections with room around them. On a phone the columns stack in that order.
 */
export default function Home() {
    const [date, setDate] = useState(todayKey())
    const { show: showTomorrow } = useTomorrowVisible(date)
    const nutrition = useNutritionToday(date)
    const budget = useBudgetToday(date)
    const day = useDayEvents(date)

    return (
        <Container as="main" className="pb-20 pt-8 sm:pt-14">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            <div className="mt-10 sm:mt-12">
                <AtAGlance
                    date={date}
                    nutrition={nutrition}
                    budget={budget}
                    events={day.events}
                    eventsLoading={day.loading}
                />
            </div>

            <div className="mt-12 grid gap-x-16 gap-y-14 sm:mt-16 lg:grid-cols-12">
                {/* Act on */}
                <div className="flex min-w-0 flex-col gap-14 lg:col-span-7">
                    {/* Evenings only: tonight's prep for tomorrow comes first. */}
                    {showTomorrow && <TomorrowWidget date={date} />}
                    <FitnessWidget date={date} />
                    <TodayWidget date={date} events={day.events} loading={day.loading} />
                    <HabitsWidget date={date} />
                </div>

                {/* Glance at */}
                <div className="flex min-w-0 flex-col gap-12 lg:col-span-5 lg:border-l lg:border-neutral-200 lg:pl-12">
                    <NutritionWidget data={nutrition} />
                    <div className="border-t border-neutral-200 pt-12">
                        <WeatherWidget />
                    </div>
                    <div className="border-t border-neutral-200 pt-12">
                        <CountdownsWidget />
                    </div>
                </div>
            </div>
        </Container>
    )
}
