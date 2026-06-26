import type { WeatherLocation } from '../types'

// Open-Meteo is free, keyless and CORS-friendly, so the browser calls it directly.
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

export interface CurrentWeather {
    temperature: number
    apparentTemperature: number
    code: number
    windSpeed: number
    humidity: number
    isDay: boolean
}

export interface DailyForecast {
    date: string // YYYY-MM-DD
    code: number // WMO weather code
    tempMax: number
    tempMin: number
    /** Chance of precipitation, %. */
    precipitationProbability: number
    /** Max wind, mph. */
    windMax: number
    sunrise?: string
    sunset?: string
    uvIndexMax?: number
}

export interface HourlySlot {
    hour: number
    temperature: number
    precipitationProbability: number
    precipitation: number
    windGust: number
    visibility: number
    code: number
}

export interface WeatherWarning {
    id: string
    severity: 'yellow' | 'amber' | 'red'
    icon: string
    title: string
    detail: string
}

export interface Forecast {
    current: CurrentWeather
    /** Today plus the next three days (four entries). */
    daily: DailyForecast[]
    /** Today's hourly slots (hours 0–23). */
    hourly: HourlySlot[]
}

interface OpenMeteoForecastResponse {
    current: {
        temperature_2m: number
        apparent_temperature: number
        weather_code: number
        wind_speed_10m: number
        relative_humidity_2m: number
        is_day: number
    }
    hourly: {
        time: string[]
        temperature_2m: number[]
        precipitation_probability: (number | null)[]
        precipitation: number[]
        wind_gusts_10m: number[]
        visibility: number[]
        weather_code: number[]
    }
    daily: {
        time: string[]
        weather_code: number[]
        temperature_2m_max: number[]
        temperature_2m_min: number[]
        precipitation_probability_max: (number | null)[]
        wind_speed_10m_max: number[]
        sunrise: string[]
        sunset: string[]
        uv_index_max: (number | null)[]
    }
}

export async function fetchForecast(loc: WeatherLocation): Promise<Forecast> {
    const params = new URLSearchParams({
        latitude: String(loc.latitude),
        longitude: String(loc.longitude),
        current:
            'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
        hourly: 'temperature_2m,precipitation_probability,precipitation,wind_gusts_10m,visibility,weather_code',
        daily:
            'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max',
        timezone: 'auto',
        wind_speed_unit: 'mph',
        forecast_days: '3',
    })

    const res = await fetch(`${FORECAST_URL}?${params.toString()}`)
    if (!res.ok) throw new Error('Could not load the forecast')
    const data = (await res.json()) as OpenMeteoForecastResponse
    const d = data.daily

    const daily: DailyForecast[] = d.time.map((date, i) => ({
        date,
        code: d.weather_code[i],
        tempMax: Math.round(d.temperature_2m_max[i]),
        tempMin: Math.round(d.temperature_2m_min[i]),
        precipitationProbability: d.precipitation_probability_max[i] ?? 0,
        windMax: Math.round(d.wind_speed_10m_max[i]),
        sunrise: d.sunrise?.[i],
        sunset: d.sunset?.[i],
        uvIndexMax: d.uv_index_max?.[i] ?? undefined,
    }))

    // Only keep today's 24 hours (first 24 slots)
    const h = data.hourly
    const hourly: HourlySlot[] = h.time.slice(0, 24).map((_, i) => ({
        hour: i,
        temperature: Math.round(h.temperature_2m[i]),
        precipitationProbability: h.precipitation_probability[i] ?? 0,
        precipitation: h.precipitation[i] ?? 0,
        windGust: Math.round(h.wind_gusts_10m[i] ?? 0),
        visibility: Math.round((h.visibility[i] ?? 10000) / 1000), // km
        code: h.weather_code[i],
    }))

    const c = data.current
    return {
        current: {
            temperature: Math.round(c.temperature_2m),
            apparentTemperature: Math.round(c.apparent_temperature),
            code: c.weather_code,
            windSpeed: Math.round(c.wind_speed_10m),
            humidity: Math.round(c.relative_humidity_2m),
            isDay: c.is_day === 1,
        },
        daily,
        hourly,
    }
}

export interface GeocodeResult extends WeatherLocation {
    country?: string
    admin1?: string
}

interface OpenMeteoGeoResponse {
    results?: Array<{
        name: string
        latitude: number
        longitude: number
        country?: string
        admin1?: string
    }>
}

export async function searchLocations(query: string): Promise<GeocodeResult[]> {
    const q = query.trim()
    if (!q) return []
    const params = new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })
    const res = await fetch(`${GEOCODE_URL}?${params.toString()}`)
    if (!res.ok) return []
    const data = (await res.json()) as OpenMeteoGeoResponse
    return (data.results ?? []).map((r) => ({
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country,
        admin1: r.admin1,
    }))
}

interface ReverseGeoResponse {
    city?: string
    locality?: string
    principalSubdivision?: string
    countryName?: string
}

/**
 * Best-effort name for a set of coordinates (used by "Use my location"), via
 * BigDataCloud's free keyless reverse geocoder. Returns null on any failure so
 * callers can fall back to a generic label — the forecast works regardless.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    try {
        const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            localityLanguage: 'en',
        })
        const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`
        )
        if (!res.ok) return null
        const data = (await res.json()) as ReverseGeoResponse
        return data.city || data.locality || data.principalSubdivision || null
    } catch {
        return null
    }
}

interface CodeInfo {
    label: string
    /** Font Awesome class string. */
    icon: string
}

/** WMO weather code → short description and a Font Awesome icon. */
export function weatherInfo(code: number, isDay = true): CodeInfo {
    const sun = isDay ? 'fa-sun' : 'fa-moon'
    const cloudSun = isDay ? 'fa-cloud-sun' : 'fa-cloud-moon'
    const showers = isDay ? 'fa-cloud-sun-rain' : 'fa-cloud-moon-rain'

    if (code === 0) return { label: 'Clear sky', icon: `fa-solid ${sun}` }
    if (code === 1) return { label: 'Mainly clear', icon: `fa-solid ${cloudSun}` }
    if (code === 2) return { label: 'Partly cloudy', icon: `fa-solid ${cloudSun}` }
    if (code === 3) return { label: 'Overcast', icon: 'fa-solid fa-cloud' }
    if (code === 45 || code === 48) return { label: 'Fog', icon: 'fa-solid fa-smog' }
    if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'fa-solid fa-cloud-rain' }
    if (code >= 61 && code <= 65) return { label: 'Rain', icon: 'fa-solid fa-cloud-showers-heavy' }
    if (code === 66 || code === 67) return { label: 'Freezing rain', icon: 'fa-solid fa-cloud-showers-heavy' }
    if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'fa-solid fa-snowflake' }
    if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: `fa-solid ${showers}` }
    if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'fa-solid fa-snowflake' }
    if (code >= 95) return { label: 'Thunderstorm', icon: 'fa-solid fa-cloud-bolt' }
    return { label: 'Unsettled', icon: 'fa-solid fa-cloud' }
}

interface WearInput {
    tempMax: number
    tempMin: number
    code: number
    precipitationProbability: number
    windMax: number
}

/** A short, plain-English "what to wear" tip derived from the day's numbers. */
export function whatToWear(day: WearInput): string {
    const parts: string[] = []
    const t = day.tempMax

    if (t >= 24) parts.push('Warm — light clothes, and sunscreen if it’s sunny')
    else if (t >= 17) parts.push('Mild — a t-shirt or light layers')
    else if (t >= 10) parts.push('Cool — a jumper or light jacket')
    else if (t >= 4) parts.push('Cold — a warm coat and layers')
    else parts.push('Freezing — heavy coat, hat and gloves')

    // Bottoms: shorts at 17° or above, otherwise trousers.
    parts.push(t >= 17 ? 'shorts weather' : 'trousers')

    const isSnow = (day.code >= 71 && day.code <= 77) || day.code === 85 || day.code === 86
    const isRain =
        (day.code >= 51 && day.code <= 67) || (day.code >= 80 && day.code <= 82) || day.code >= 95

    if (isSnow) parts.push('snow likely, wear sturdy boots')
    else if (isRain || day.precipitationProbability >= 50) parts.push('take a waterproof or umbrella')

    if (day.windMax >= 25) parts.push('it’s windy, add a windproof layer')

    return parts.join('; ')
}

function fmt12(hour: number): string {
    if (hour === 0) return 'midnight'
    if (hour === 12) return 'midday'
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/**
 * Derives weather warnings from today's hourly data and daily summary.
 * Returns an array sorted by severity (red → amber → yellow).
 */
export function weatherWarnings(hourly: HourlySlot[], today: DailyForecast): WeatherWarning[] {
    const waking = hourly.filter((h) => h.hour >= 6 && h.hour <= 23)
    const warnings: WeatherWarning[] = []

    // Thunderstorm
    const thunderHours = waking.filter((h) => h.code >= 95)
    if (thunderHours.length > 0) {
        const first = thunderHours[0]
        const hasHail = thunderHours.some((h) => h.code === 96 || h.code === 99)
        warnings.push({
            id: 'thunder',
            severity: hasHail ? 'red' : 'amber',
            icon: 'fa-solid fa-cloud-bolt',
            title: hasHail ? 'Thunderstorm with hail' : 'Thunderstorm warning',
            detail: `Thunderstorms expected from ${fmt12(first.hour)}${hasHail ? ' — hail possible' : ''}`,
        })
    }

    // High winds (gusts)
    const maxGust = Math.max(...waking.map((h) => h.windGust))
    if (maxGust >= 60) {
        warnings.push({
            id: 'wind',
            severity: 'red',
            icon: 'fa-solid fa-wind',
            title: 'Severe wind warning',
            detail: `Gusts up to ${maxGust}mph — avoid exposed areas`,
        })
    } else if (maxGust >= 40) {
        warnings.push({
            id: 'wind',
            severity: 'amber',
            icon: 'fa-solid fa-wind',
            title: 'Strong winds',
            detail: `Gusts up to ${maxGust}mph — take care outdoors`,
        })
    } else if (maxGust >= 25) {
        warnings.push({
            id: 'wind',
            severity: 'yellow',
            icon: 'fa-solid fa-wind',
            title: 'Breezy conditions',
            detail: `Gusts up to ${maxGust}mph`,
        })
    }

    // Heavy rain — total precipitation
    const totalRain = waking.reduce((sum, h) => sum + h.precipitation, 0)
    const maxHourlyRain = Math.max(...waking.map((h) => h.precipitation))
    if (totalRain >= 30 || maxHourlyRain >= 10) {
        warnings.push({
            id: 'rain',
            severity: 'red',
            icon: 'fa-solid fa-cloud-showers-heavy',
            title: 'Heavy rain warning',
            detail: `${Math.round(totalRain)}mm expected today — flooding possible`,
        })
    } else if (totalRain >= 10 || maxHourlyRain >= 4) {
        warnings.push({
            id: 'rain',
            severity: 'amber',
            icon: 'fa-solid fa-cloud-showers-heavy',
            title: 'Heavy rain',
            detail: `${Math.round(totalRain)}mm expected today`,
        })
    } else if (today.precipitationProbability >= 70) {
        warnings.push({
            id: 'rain',
            severity: 'yellow',
            icon: 'fa-solid fa-cloud-rain',
            title: 'Rain likely',
            detail: `${today.precipitationProbability}% chance of rain`,
        })
    }

    // Low visibility / fog
    const minVis = Math.min(...waking.map((h) => h.visibility))
    if (minVis <= 0.2) {
        warnings.push({
            id: 'fog',
            severity: 'amber',
            icon: 'fa-solid fa-smog',
            title: 'Dense fog',
            detail: 'Visibility below 200m — dangerous driving conditions',
        })
    } else if (minVis <= 1) {
        warnings.push({
            id: 'fog',
            severity: 'yellow',
            icon: 'fa-solid fa-smog',
            title: 'Fog warning',
            detail: `Visibility as low as ${minVis < 1 ? Math.round(minVis * 1000) + 'm' : minVis + 'km'}`,
        })
    }

    // UV
    const uv = today.uvIndexMax ?? 0
    if (uv >= 8) {
        warnings.push({
            id: 'uv',
            severity: 'amber',
            icon: 'fa-solid fa-sun',
            title: 'Very high UV',
            detail: `UV index ${uv} — sunscreen essential, limit midday sun`,
        })
    } else if (uv >= 6) {
        warnings.push({
            id: 'uv',
            severity: 'yellow',
            icon: 'fa-solid fa-sun',
            title: 'High UV',
            detail: `UV index ${uv} — sunscreen recommended`,
        })
    }

    // Sort: red first, then amber, then yellow
    const order: Record<WeatherWarning['severity'], number> = { red: 0, amber: 1, yellow: 2 }
    return warnings.sort((a, b) => order[a.severity] - order[b.severity])
}

/**
 * Derives a plain-English planning insight from today's hourly data.
 * Looks at waking hours (6am–10pm) only.
 */
export function planningInsight(hourly: HourlySlot[]): string {
    const waking = hourly.filter((h) => h.hour >= 6 && h.hour <= 22)
    if (waking.length === 0) return ''

    const RAIN_THRESHOLD = 50

    // Find first hour rain becomes likely
    const rainStart = waking.find((h) => h.precipitationProbability >= RAIN_THRESHOLD)
    // Find last hour rain is likely
    const rainEnd = [...waking].reverse().find((h) => h.precipitationProbability >= RAIN_THRESHOLD)

    // All-day dry
    const allDry = waking.every((h) => h.precipitationProbability < RAIN_THRESHOLD)
    if (allDry) {
        const peak = waking.reduce((a, b) => (a.temperature > b.temperature ? a : b))
        return `Dry all day — warmest around ${fmt12(peak.hour)} at ${peak.temperature}°`
    }

    // All-day wet
    const allWet = waking.every((h) => h.precipitationProbability >= RAIN_THRESHOLD)
    if (allWet) {
        return `Rain expected throughout the day — best to stay prepared`
    }

    // Rain clears at some point
    const clearAfterRain = rainEnd && waking.some((h) => h.hour > rainEnd.hour && h.precipitationProbability < RAIN_THRESHOLD)
    if (clearAfterRain && rainEnd) {
        const clearHour = waking.find((h) => h.hour > rainEnd.hour && h.precipitationProbability < RAIN_THRESHOLD)
        if (clearHour) return `Rain easing around ${fmt12(clearHour.hour)} — afternoon should improve`
    }

    // Rain arrives later
    if (rainStart) {
        const dryBefore = waking.filter((h) => h.hour < rainStart.hour)
        if (dryBefore.length > 0) {
            const peak = dryBefore.reduce((a, b) => (a.temperature > b.temperature ? a : b))
            return `Rain arriving around ${fmt12(rainStart.hour)} — best to get out before then (${peak.temperature}° at ${fmt12(peak.hour)})`
        }
    }

    return 'Mixed conditions today — keep an eye on the forecast'
}

/** "Today", "Tomorrow", else a short weekday like "Thu". */
export function dayLabel(date: string, today: string): string {
    if (date === today) return 'Today'
    const d = new Date(`${date}T00:00:00`)
    const t = new Date(`${today}T00:00:00`)
    const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000)
    if (diff === 1) return 'Tomorrow'
    return d.toLocaleDateString('en-GB', { weekday: 'short' })
}
