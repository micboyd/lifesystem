import Drawer from '../Drawer'
import Button from '../Button'
import {
    compass,
    dayCondition,
    dayLabel,
    formatDuration,
    hourLabel,
    planningInsight,
    SEVERITY_ICON_STYLES,
    SEVERITY_STYLES,
    uvLabel,
    weatherInfo,
    weatherWarnings,
    whatToWear,
    wearInputForHours,
    windLabel,
    type Forecast,
    type HourlySlot,
} from '../../lib/weather'
import { ConditionIcon, ConditionTile, Metric, MetricGrid, Section, WearNote, WindArrow, clockTime } from './weatherUi'

function longDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function StepFooter({
    prevLabel,
    nextLabel,
    onPrev,
    onNext,
}: {
    prevLabel: string
    nextLabel: string
    onPrev?: () => void
    onNext?: () => void
}) {
    return (
        <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" icon="fa-solid fa-arrow-left" onClick={onPrev} disabled={!onPrev}>
                {prevLabel}
            </Button>
            <Button variant="secondary" icon="fa-solid fa-arrow-right" iconPosition="right" onClick={onNext} disabled={!onNext}>
                {nextLabel}
            </Button>
        </div>
    )
}

/** The big reading at the top of a drawer: sky tile, temperature, condition. */
function Headline({ code, isDay, temp, line }: { code: number; isDay: boolean; temp: string; line: string }) {
    return (
        <div className="flex items-center gap-4">
            <ConditionTile code={code} isDay={isDay} />
            <div className="min-w-0">
                <p className="text-[40px] font-semibold leading-none tracking-[-0.03em] text-neutral-900">{temp}</p>
                <p className="mt-1.5 text-sm text-neutral-600">{line}</p>
            </div>
        </div>
    )
}

/** Everything the forecast knows about one hour, stepping through the strip's 24. */
export function HourDrawer({
    hours,
    open,
    index,
    today,
    onIndex,
    onClose,
}: {
    hours: HourlySlot[]
    open: boolean
    index: number
    today: string
    onIndex: (i: number) => void
    onClose: () => void
}) {
    const h = hours[index] as HourlySlot | undefined
    const prev = index > 0 ? hours[index - 1] : undefined
    const next = hours[index + 1] as HourlySlot | undefined
    const when = (s: HourlySlot, i: number) => (i === 0 ? 'Now' : hourLabel(s.hour))
    const wear = h ? wearInputForHours([h]) : null

    return (
        <Drawer
            open={open && !!h}
            onClose={onClose}
            size="lg"
            title={h ? `${index === 0 ? 'Now' : hourLabel(h.hour)} · ${dayLabel(h.date, today)}` : ''}
            footer={
                h ? (
                    <StepFooter
                        prevLabel={prev ? when(prev, index - 1) : 'Earlier'}
                        nextLabel={next ? hourLabel(next.hour) : 'Later'}
                        onPrev={prev ? () => onIndex(index - 1) : undefined}
                        onNext={next ? () => onIndex(index + 1) : undefined}
                    />
                ) : undefined
            }
        >
            {h && (
                <div className="flex flex-col gap-6">
                    <Headline
                        code={h.code}
                        isDay={h.isDay}
                        temp={`${h.temperature}°`}
                        line={`${weatherInfo(h.code, h.isDay).label} · feels like ${h.apparentTemperature}°`}
                    />

                    <Section title="Rain">
                        <MetricGrid>
                            <Metric icon="fa-solid fa-umbrella" label="Chance" value={`${h.precipitationProbability}%`} />
                            <Metric
                                icon="fa-solid fa-droplet"
                                label="Amount"
                                value={`${h.precipitation.toFixed(1)} mm`}
                                sub={h.precipitation < 0.2 ? 'None to speak of' : h.precipitation < 1 ? 'Light' : h.precipitation < 4 ? 'Moderate' : 'Heavy'}
                            />
                            <Metric icon="fa-solid fa-cloud" label="Cloud cover" value={`${h.cloudCover}%`} />
                        </MetricGrid>
                    </Section>

                    <Section title="Wind">
                        <MetricGrid>
                            <Metric
                                icon="fa-solid fa-wind"
                                label="Speed"
                                value={`${h.windSpeed} mph`}
                                sub={windLabel(h.windSpeed)}
                            />
                            <Metric icon="fa-solid fa-gauge-high" label="Gusts" value={`${h.windGust} mph`} />
                            <Metric
                                icon="fa-solid fa-compass"
                                label="From"
                                value={
                                    <span className="inline-flex items-center gap-2">
                                        {compass(h.windDirection)}
                                        <WindArrow degrees={h.windDirection} className="text-sm text-neutral-500" />
                                    </span>
                                }
                            />
                        </MetricGrid>
                    </Section>

                    <Section title="Air & sun">
                        <MetricGrid>
                            <Metric icon="fa-solid fa-temperature-half" label="Feels like" value={`${h.apparentTemperature}°`} />
                            <Metric icon="fa-solid fa-droplet" label="Humidity" value={`${h.humidity}%`} />
                            <Metric
                                icon="fa-solid fa-sun"
                                label="UV index"
                                value={h.isDay ? String(Math.round(h.uvIndex)) : '0'}
                                sub={h.isDay ? uvLabel(h.uvIndex) : 'After dark'}
                            />
                            <Metric
                                icon="fa-solid fa-eye"
                                label="Visibility"
                                value={h.visibility < 1 ? `${Math.round(h.visibility * 1000)} m` : `${Math.round(h.visibility)} km`}
                            />
                        </MetricGrid>
                    </Section>

                    {wear && (
                        <Section title="What to wear">
                            <WearNote>{whatToWear(wear)}</WearNote>
                        </Section>
                    )}
                </div>
            )}
        </Drawer>
    )
}

/** A day's full picture: headline, warnings, three-hourly slices and the numbers. */
export function DayDrawer({
    forecast,
    open,
    index,
    today,
    onIndex,
    onClose,
}: {
    forecast: Forecast
    open: boolean
    index: number
    today: string
    onIndex: (i: number) => void
    onClose: () => void
}) {
    const days = forecast.daily
    const d = days[index] as (typeof days)[number] | undefined
    const prev = index > 0 ? days[index - 1] : undefined
    const next = days[index + 1] as (typeof days)[number] | undefined
    const hourly = d ? (forecast.hourlyByDate[d.date] ?? []) : []
    const code = d ? dayCondition(d, hourly) : 0
    const slices = hourly.filter((h) => h.hour % 3 === 0)
    const nowHour = new Date().getHours()
    const warnings = d && hourly.length > 0 ? weatherWarnings(hourly, d) : []
    const insight = planningInsight(hourly)

    return (
        <Drawer
            open={open && !!d}
            onClose={onClose}
            size="lg"
            title={d ? longDate(d.date) : ''}
            badge={d && (d.date === today || index === 1) ? dayLabel(d.date, today) : undefined}
            footer={
                d ? (
                    <StepFooter
                        prevLabel={prev ? dayLabel(prev.date, today) : 'Earlier'}
                        nextLabel={next ? dayLabel(next.date, today) : 'Later'}
                        onPrev={prev ? () => onIndex(index - 1) : undefined}
                        onNext={next ? () => onIndex(index + 1) : undefined}
                    />
                ) : undefined
            }
        >
            {d && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-4">
                        <Headline
                            code={code}
                            isDay
                            temp={`${d.tempMax}° / ${d.tempMin}°`}
                            line={`${weatherInfo(code).label} · feels ${d.apparentMax}° at best`}
                        />
                        {insight && <p className="text-[15px] leading-relaxed text-neutral-700">{insight}.</p>}
                    </div>

                    {warnings.length > 0 && (
                        <div className="flex flex-col gap-2">
                            {warnings.map((w) => (
                                <div key={w.id} className={`flex gap-3 rounded-2xl border px-4 py-3 ${SEVERITY_STYLES[w.severity]}`}>
                                    <i className={`${w.icon} mt-0.5 ${SEVERITY_ICON_STYLES[w.severity]}`} aria-hidden="true" />
                                    <div>
                                        <p className="text-sm font-semibold">{w.title}</p>
                                        <p className="text-xs opacity-90">{w.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {slices.length > 0 && (
                        <Section title="Through the day">
                            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl ring-1 ring-neutral-900/[0.06]">
                                {slices.map((h) => {
                                    const past = d.date === today && h.hour + 3 <= nowHour
                                    return (
                                        <li
                                            key={h.hour}
                                            className={`flex items-center gap-3 px-4 py-2.5 text-sm ${past ? 'opacity-40' : ''}`}
                                        >
                                            <span className="w-11 shrink-0 font-medium text-neutral-500">{hourLabel(h.hour)}</span>
                                            <span className="grid w-6 shrink-0 place-items-center text-base">
                                                <ConditionIcon code={h.code} isDay={h.isDay} />
                                            </span>
                                            <span className="w-9 shrink-0 font-semibold tabular-nums text-neutral-900">
                                                {h.temperature}°
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-500">
                                                {weatherInfo(h.code, h.isDay).label}
                                            </span>
                                            <span
                                                className={`w-11 shrink-0 text-right text-xs tabular-nums ${
                                                    h.precipitationProbability >= 40 ? 'font-semibold text-sky-600' : 'text-neutral-400'
                                                }`}
                                            >
                                                {h.precipitationProbability}%
                                            </span>
                                            <span className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-xs tabular-nums text-neutral-500">
                                                <WindArrow degrees={h.windDirection} className="text-[10px] text-neutral-400" />
                                                {h.windSpeed} mph
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        </Section>
                    )}

                    <Section title="Details">
                        <MetricGrid>
                            <Metric
                                icon="fa-solid fa-umbrella"
                                label="Rain"
                                value={`${d.precipitationProbability}%`}
                                sub={
                                    d.precipitationSum >= 0.2
                                        ? `${d.precipitationSum.toFixed(1)} mm over ${Math.round(d.precipitationHours)}h`
                                        : 'Little or none'
                                }
                            />
                            <Metric
                                icon="fa-solid fa-wind"
                                label="Wind"
                                value={`${d.windMax} mph`}
                                sub={`Gusts ${d.windGustMax} · from ${compass(d.windDirection)}`}
                            />
                            <Metric
                                icon="fa-solid fa-temperature-half"
                                label="Feels like"
                                value={`${d.apparentMax}° / ${d.apparentMin}°`}
                            />
                            <Metric
                                icon="fa-solid fa-sun"
                                label="UV max"
                                value={d.uvIndexMax != null ? String(Math.round(d.uvIndexMax)) : '—'}
                                sub={d.uvIndexMax != null ? uvLabel(d.uvIndexMax) : undefined}
                            />
                            <Metric
                                icon="fa-solid fa-arrow-up"
                                label="Sunrise"
                                value={clockTime(d.sunrise)}
                                sub={`Sunset ${clockTime(d.sunset)}`}
                            />
                            <Metric icon="fa-regular fa-clock" label="Daylight" value={formatDuration(d.daylightDuration)} />
                        </MetricGrid>
                    </Section>

                    <Section title="What to wear">
                        <WearNote>{whatToWear({ ...d, code })}</WearNote>
                    </Section>
                </div>
            )}
        </Drawer>
    )
}
