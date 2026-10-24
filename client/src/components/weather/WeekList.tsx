import type { Forecast } from '../../lib/weather'
import { dayCondition, dayLabel, weatherInfo } from '../../lib/weather'
import { ConditionIcon } from './weatherUi'

/** One plain row per day: the sky, the rain chance, and the high and low. */
export default function WeekList({
    forecast,
    today,
    onSelect,
}: {
    forecast: Forecast
    today: string
    onSelect: (index: number) => void
}) {
    return (
        <ul className="divide-y divide-neutral-100">
            {forecast.daily.map((d, i) => {
                const code = dayCondition(d, forecast.hourlyByDate[d.date] ?? [])
                const p = d.precipitationProbability
                return (
                    <li key={d.date}>
                        <button
                            type="button"
                            onClick={() => onSelect(i)}
                            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none sm:gap-4 sm:px-6"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-neutral-900">
                                    {dayLabel(d.date, today)}
                                </span>
                                <span className="block truncate text-xs text-neutral-500">
                                    {weatherInfo(code).label}
                                </span>
                            </span>

                            <span className="grid w-8 shrink-0 place-items-center text-xl">
                                <ConditionIcon code={code} />
                            </span>

                            <span
                                className={`w-14 shrink-0 text-right text-[13px] tabular-nums ${
                                    p >= 40 ? 'font-semibold text-sky-600' : 'text-neutral-400'
                                }`}
                            >
                                <i className="fa-solid fa-droplet mr-1 text-[10px]" aria-hidden="true" />
                                {p}%
                            </span>

                            <span className="w-20 shrink-0 text-right text-[15px]">
                                <span className="font-semibold text-neutral-900">{d.tempMax}°</span>
                                <span className="text-neutral-400"> / {d.tempMin}°</span>
                            </span>

                            <i
                                className="fa-solid fa-chevron-right hidden text-xs text-neutral-300 sm:block"
                                aria-hidden="true"
                            />
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}
