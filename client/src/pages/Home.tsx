import { useState } from 'react'
import { DashCompact } from '../components/dashboard/DashSection'
import ModuleLayout from '../components/ModuleLayout'
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
 * Today, hybrid style. The page: a greeting and the day in a sentence, the
 * headline figures, then the day in order as one list. The context column
 * beside it (below it on narrower screens): steps, weather, the timeline,
 * countdowns and birthdays, each a compact section split by hairlines.
 */
export default function Home() {
    const [date, setDate] = useState(todayKey())
    const { show: showTomorrow } = useTomorrowVisible(date)
    // Read once here: the headline figures and the steps section both show them.
    const steps = useSteps(todayKey())

    const context = (
        <DashCompact>
            <div className="flex flex-col gap-8 [&>*+*]:border-t [&>*+*]:border-hairline [&>*+*]:pt-7">
                <StepsWidget data={steps} />
                <CaloriesOutWidget />
                <WeatherWidget />
                <TimelineWidget />
                <CountdownsWidget show="until" />
                <CountdownsWidget show="since" />
                <BirthdaysWidget date={date} />
            </div>
        </DashCompact>
    )

    return (
        <ModuleLayout aside={context} asideLabel="Context">
            <div className="px-5 pb-20 pt-8 sm:px-10 sm:pt-10">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <DashboardHeader />
                    <DashboardDateNav date={date} onChange={setDate} />
                </div>
                <div className="mt-2">
                    <YourDayWidget date={date} glance={date === todayKey() ? <StepsGlance data={steps} /> : undefined} />
                </div>
                {/* Evenings only: tonight's prep for tomorrow. */}
                {showTomorrow && (
                    <div className="mt-14">
                        <TomorrowWidget date={date} />
                    </div>
                )}
            </div>
        </ModuleLayout>
    )
}
