import { describe, expect, it } from 'vitest'
import { compass, formatDuration, hoursFromNow, hoursSummary, uvLabel, type Forecast, type HourlySlot } from './weather'

function slot(date: string, hour: number, over: Partial<HourlySlot> = {}): HourlySlot {
    return {
        date,
        hour,
        temperature: 10,
        precipitationProbability: 0,
        precipitation: 0,
        windGust: 10,
        visibility: 10,
        code: 1,
        apparentTemperature: 9,
        humidity: 70,
        windSpeed: 8,
        windDirection: 225,
        cloudCover: 30,
        uvIndex: 1,
        isDay: true,
        ...over,
    }
}

function forecastFor(dates: string[]): Forecast {
    const hourlyByDate = Object.fromEntries(dates.map((d) => [d, Array.from({ length: 24 }, (_, h) => slot(d, h))]))
    return {
        current: {} as Forecast['current'],
        daily: dates.map((date) => ({ date }) as Forecast['daily'][number]),
        hourly: hourlyByDate[dates[0]],
        hourlyByDate,
    }
}

describe('hoursFromNow', () => {
    it('starts on the current hour and walks across midnight', () => {
        const f = forecastFor(['2026-10-20', '2026-10-21'])
        const hours = hoursFromNow(f, 24, new Date('2026-10-20T15:40:00'))
        expect(hours).toHaveLength(24)
        expect(hours[0]).toMatchObject({ date: '2026-10-20', hour: 15 })
        expect(hours[23]).toMatchObject({ date: '2026-10-21', hour: 14 })
    })

    it('stops short when the forecast runs out', () => {
        const f = forecastFor(['2026-10-20'])
        expect(hoursFromNow(f, 24, new Date('2026-10-20T20:00:00'))).toHaveLength(4)
    })
})

describe('compass', () => {
    it('maps bearings to eight points, wrapping at north', () => {
        expect(compass(0)).toBe('N')
        expect(compass(225)).toBe('SW')
        expect(compass(350)).toBe('N')
        expect(compass(-90)).toBe('W')
    })
})

describe('uvLabel / formatDuration', () => {
    it('uses the WHO bands', () => {
        expect(uvLabel(2.4)).toBe('Low')
        expect(uvLabel(6)).toBe('High')
        expect(uvLabel(11)).toBe('Extreme')
    })
    it('formats seconds as hours and minutes', () => {
        expect(formatDuration(36_900)).toBe('10h 15m')
    })
})

describe('hoursSummary', () => {
    it('calls a dry day dry', () => {
        const hours = Array.from({ length: 24 }, (_, i) => slot('2026-10-20', i, { temperature: 8 + (i === 14 ? 6 : 0) }))
        expect(hoursSummary(hours)).toBe('Dry for the next 24 hours. High of 14° at 2pm, low of 8° now.')
    })

    it('says when rain arrives and when it eases', () => {
        const hours = [9, 10, 11, 12, 13].map((h) =>
            slot('2026-10-20', h, { precipitationProbability: h === 11 || h === 12 ? 70 : 10 })
        )
        expect(hoursSummary(hours)).toBe('Rain likely from 11am, easing by 1pm.')
    })
})
