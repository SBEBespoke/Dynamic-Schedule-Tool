import { useState, useEffect } from 'react'

const LAT = -34.9285
const LON = 138.6007

/**
 * Fetches a 16-day hourly forecast from Open-Meteo (no start/end date needed —
 * always returns today + 16 days). We then look up by each day's calendar date.
 *
 * If an event day's date falls outside the 16-day window, getWeather() returns
 * null and nothing is shown on that session row.
 *
 * @param {Array} days — event day records, each may have a `date` (YYYY-MM-DD)
 */
export function useWeather(days) {
  const [hourlyMap,        setHourlyMap]        = useState({}) // { 'YYYY-MM-DD': { hour: { temp, precipProb, precip, code } } }
  const [forecastAvailable, setForecastAvailable] = useState(false)

  // Only fetch once (the 16-day window doesn't change day to day in practice).
  // Re-fetch if the component is mounted fresh.
  useEffect(() => {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${LAT}&longitude=${LON}` +
      `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code` +
      `&wind_speed_unit=kmh` +
      `&timezone=Australia%2FAdelaide` +
      `&forecast_days=16`

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const h = data?.hourly
        if (!h?.time?.length) return

        const byDate = {}
        h.time.forEach((t, i) => {
          // t is like "2026-05-28T14:00"
          const sep      = t.indexOf('T')
          const dateStr  = t.slice(0, sep)
          const hourStr  = t.slice(sep + 1, sep + 3)   // "14"
          const hour     = parseInt(hourStr, 10)

          if (!byDate[dateStr]) byDate[dateStr] = {}
          byDate[dateStr][hour] = {
            temp:       Math.round(h.temperature_2m?.[i] ?? 0),
            precipProb: Math.round(h.precipitation_probability?.[i] ?? 0),
            precip:     Math.round((h.precipitation?.[i] ?? 0) * 10) / 10,
            code:       h.weather_code?.[i] ?? 0,
          }
        })

        setHourlyMap(byDate)
        setForecastAvailable(Object.keys(byDate).length > 0)
      })
      .catch(() => {
        // Fail silently — weather is a nice-to-have, not critical
      })
  }, []) // Fetch once on mount

  /**
   * Look up weather for a specific session (point in time).
   * @param {string|null} date      — 'YYYY-MM-DD'
   * @param {number}      startMins — minutes from midnight
   */
  function getWeather(date, startMins) {
    if (!date) return null
    const dayData = hourlyMap[date]
    if (!dayData) return null
    const hour = Math.floor(startMins / 60)
    return dayData[hour]
        ?? dayData[Math.max(0, hour - 1)]
        ?? dayData[Math.min(23, hour + 1)]
        ?? null
  }

  /**
   * Aggregate an entire day into a forecast summary.
   * Returns { tempMin, tempMax, totalPrecip, maxPrecipProb, code } or null.
   */
  function getDayWeather(date) {
    if (!date) return null
    const dayData = hourlyMap[date]
    if (!dayData) return null

    const entries = Object.entries(dayData).map(([h, v]) => ({ hour: Number(h), ...v }))
    if (entries.length === 0) return null

    const temps       = entries.map(e => e.temp)
    const totalPrecip = entries.reduce((sum, e) => sum + (e.precip || 0), 0)
    const maxPrecipProb = Math.max(...entries.map(e => e.precipProb))

    // Dominant condition: worst WMO code during daytime hours (06:00–20:00)
    const daytime     = entries.filter(e => e.hour >= 6 && e.hour <= 20)
    const pool        = daytime.length > 0 ? daytime : entries
    const dominantCode = pool.reduce((worst, e) => (e.code > worst ? e.code : worst), 0)

    return {
      tempMin:      Math.min(...temps),
      tempMax:      Math.max(...temps),
      totalPrecip:  Math.round(totalPrecip * 10) / 10,
      maxPrecipProb,
      code:         dominantCode,
    }
  }

  /** Returns true if the date is within the fetched forecast window. */
  function dateInWindow(date) {
    return Boolean(date && hourlyMap[date])
  }

  return { getWeather, getDayWeather, dateInWindow, forecastAvailable }
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
  if (prob >= 60) return '#ef4444'    // red    — high risk
  if (prob >= 30) return '#f97316'    // orange — moderate risk
  return 'var(--text-dim)'            // dim    — low / no risk
}
