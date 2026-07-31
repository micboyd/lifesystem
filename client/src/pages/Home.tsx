import { useState } from 'react'
import Container from '../components/Container'
import Tabs from '../components/Tabs'
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
import NutritionWidget from '../components/dashboard/NutritionWidget'
import FitnessWidget from '../components/dashboard/FitnessWidget'
import { todayKey } from '../lib/calendar'

const TABS = ['Today', 'Week ahead'] as const
type Tab = (typeof TABS)[number]

export default function Home() {
    const [date, setDate] = useState(todayKey())
    const [tab, setTab] = useState<Tab>('Today')
    const { show: showTomorrow } = useTomorrowVisible(date)

    return (
        <Container as="main" className="py-8 sm:py-10">
            {/* Greeting + date nav */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <DashboardHeader />
                <DashboardDateNav date={date} onChange={setDate} />
            </div>

            <Tabs
                tabs={[...TABS]}
                value={tab}
                onChange={(t) => setTab(t as Tab)}
                className="mt-6"
            />

            {tab === 'Today' ? (
                <>
                    {/* Today's schedule — the core of the day. */}
                    <section className="mt-6">
                        <TodayWidget date={date} />
                    </section>

                    {/* In the evening, the tomorrow-prep brief spans full width directly
                        under the day's schedule — it's the natural next thing to act on. */}
                    {showTomorrow && (
                        <div className="mt-6">
                            <TomorrowWidget date={date} />
                        </div>
                    )}

                    {/* A few essentials. A masonry-style flow packs the tiles to balance
                        the column heights, so short and tall cards fill in around each
                        other rather than leaving one column stranded with a gap. */}
                    <div className="mt-6 gap-6 [column-fill:_balance] lg:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
                        <TasksWidget date={date} />
                        <HabitsWidget date={date} />
                        <FitnessWidget date={date} cadence="today" />
                        <NutritionWidget date={date} cadence="today" />
                        <BudgetWidget date={date} cadence="today" />
                        <WeatherWidget variant="hourly" />
                    </div>
                </>
            ) : (
                /* The week ahead — a glance at what's coming, not what you act on now. */
                <div className="mt-6 gap-6 [column-fill:_balance] lg:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
                    <BudgetWidget date={date} cadence="week" />
                    <FitnessWidget date={date} cadence="week" />
                    <NutritionWidget date={date} cadence="week" />
                    <WeatherWidget variant="daily" />
                    <NextTimeOffWidget date={date} />
                    <BirthdayWidget date={date} />
                </div>
            )}
        </Container>
    )
}
