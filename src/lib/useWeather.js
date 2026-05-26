import { useState, useEffect } from 'react'

const LAT = -34.9285
const LON = 138.6007

/**
 * Fetches hourly weather forecasts for all event days that have a date set.
 * Open-Meteo covers the next ~16 days — for events further out, getWeather()
 * simply returns null and session rows show nothing until the window opens.
 *
 * @param {Array} days — event day records, each may have a `date` (YYYY-MM-DD)
 * @returns {{ getWeather, forecastAvailable, loading }}
 *   getWeather(date, startMins) → { temp, precipProb, precip, code } | null
 *   forecastAvailable → true if at least one day's data was returned
 */
export function useWeather(days) {
  const [hourlyMap, setHourlyMap] = useState({})   // { 'YYYY-MM-DD': { hour: {...} } }
  const [forecastAvailable, setForecastAvailable] = useState(false)
  const [loading, setLoading] = useState(false)

  const daysWithDates = days.filter(d => d.date)
  const dateKey = daysWithDates.map(d => d.date).sort().join(',')

  useEffect(() => {
    if (!dateKey) return

    const dates     = dateKey.split(',').sort()
    const startDate = dates[0]
    const endDate   = dates[dates.length - 1]

    setLoading(true)

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${LAT}&longitude=${LON}` +
      `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code` +
      `&wind_speed_unit=kmh` +
      `&timezone=Australia%2FAdelaide` +
      `&start_date=${startDate}&end_date=${endDate}`

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (!data.hourly?.time?.length) {
          setForecastAvailable(false)
          setLoading(false)
          return
        }

        const { time, temperature_2m, precipitation_probability, precipitation, weather_code } = data.hourly
        const byDate = {}

        time.forEach((t, i) => {
          const [dateStr, timeStr] = t.split('T')
          const hour = parseInt(timeStr, 10)   // "14:00" → 14
          if (!byDate[dateStr]) byDate[dateStr] = {}
          byDate[dateStr][hour] = {
            temp:       Math.round(temperature_2m[i]),
            precipProb: precipitation_probability?.[i] ?? 0,
            precip:     Math.round((precipitation?.[i] ?? 0) * 10) / 10,
            code:       weather_code?.[i] ?? 0,
          }
        })

        const hasData = Object.keys(byDate).length > 0
        setHourlyMap(byDate)
        setForecastAvailable(hasData)
        setLoading(false)
      })
      .catch(() => {
        setForecastAvailable(false)
        setLoading(false)
      })
  }, [dateKey])

  /**
   * Look up the forecast for a session.
   * @param {string|null} date  — 'YYYY-MM-DD'
   * @param {number} startMins  — minutes from midnight
   */
  function getWeather(date, startMins) {
    if (!date || !hourlyMap[date]) return null
    const hour     = Math.floor(startMins / 60)
    // Try exact hour, then the previous hour as a fallback
    return hourlyMap[date][hour] ?? hourlyMap[date][Math.max(0, hour - 1)] ?? null
  }

  return { getWeather, forecastAvailable, loading }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function precipEmoji(prob) {
  if (prob >= 70) return '⛈'
  if (prob >= 50) return '🌧'
  if (prob >= 30) return '🌦'
  if (prob >= 10) return '🌤'
  return '☀️'
}

export function precipColor(prob) {
  if (prob >= 60) return '#ef4444'   // red  — high risk
  if (prob >= 30) return '#f97316'   // orange — moderate risk
  return 'var(--text-dim)'           // dim  — low risk
}
