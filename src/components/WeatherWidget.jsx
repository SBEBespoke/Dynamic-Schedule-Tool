import { useState, useEffect } from 'react'
import { precipEmoji, precipColor } from '../lib/useWeather'

// Victoria Park circuit, Adelaide
const LAT = -34.9285
const LON = 138.6007

const WMO_DESCRIPTIONS = {
  0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy Fog',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
  80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
}

const WMO_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

/**
 * WeatherWidget
 *
 * When `dayForecast` is provided (from useWeather's getDayWeather) it shows
 * the predicted conditions for that event day. Otherwise it falls back to
 * fetching and showing live current conditions.
 *
 * @prop {object|null} dayForecast  — { tempMin, tempMax, totalPrecip, maxPrecipProb, code }
 * @prop {string}      dayName      — e.g. "Thursday — Practice Day"
 */
export default function WeatherWidget({ dayForecast = null, dayName = null }) {
  const [live,  setLive]  = useState(null)
  const [error, setError] = useState(false)

  // Only fetch live data when no forecast is available
  useEffect(() => {
    if (dayForecast) return   // forecast takes priority — skip live fetch

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&wind_speed_unit=kmh&timezone=Australia%2FAdelaide`

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const c = data.current
        setLive({
          temp:      Math.round(c.temperature_2m),
          feelsLike: Math.round(c.apparent_temperature),
          code:      c.weather_code,
          wind:      Math.round(c.wind_speed_10m),
          humidity:  c.relative_humidity_2m,
        })
      })
      .catch(() => setError(true))
  }, [!!dayForecast])

  if (error && !dayForecast) return null

  // ── Forecast view (day-level prediction) ────────────────────────────────────
  if (dayForecast) {
    const { tempMin, tempMax, totalPrecip, maxPrecipProb, code } = dayForecast
    const icon = WMO_ICONS[code]  || '🌡'
    const desc = WMO_DESCRIPTIONS[code] || 'Variable'
    const rainColor = precipColor(maxPrecipProb)
    const rainIcon  = precipEmoji(maxPrecipProb)

    return (
      <div style={widgetStyle} title="Victoria Park, Adelaide — forecast via open-meteo.com">
        <span style={{ fontSize: 15 }}>{icon}</span>

        {/* Temp range */}
        <span style={tempStyle}>{tempMin}–{tempMax}°C</span>
        <span style={dimStyle}>{desc}</span>

        <span style={dividerStyle} />

        {/* Rain */}
        <span style={{ ...dimStyle, color: rainColor, fontWeight: maxPrecipProb >= 30 ? 700 : 400 }}>
          {rainIcon} {maxPrecipProb}% rain
        </span>
        {totalPrecip > 0 && (
          <span style={{ ...dimStyle, color: rainColor, fontWeight: maxPrecipProb >= 30 ? 700 : 400 }}>
            💧 {totalPrecip}mm expected
          </span>
        )}

        <span style={dividerStyle} />

        <span style={{ ...dimStyle, fontSize: 10 }}>
          {dayName ? `${dayName} forecast` : 'Day forecast'} · Victoria Park
        </span>
      </div>
    )
  }

  // ── Live / loading view ──────────────────────────────────────────────────────
  if (!live) {
    return (
      <div style={widgetStyle}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🌡 Loading weather…</span>
      </div>
    )
  }

  const icon = WMO_ICONS[live.code] || '🌡'
  const desc = WMO_DESCRIPTIONS[live.code] || 'Unknown'

  return (
    <div style={widgetStyle} title="Victoria Park, Adelaide — live via open-meteo.com">
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={tempStyle}>{live.temp}°C</span>
      <span style={dimStyle}>{desc}</span>
      <span style={dividerStyle} />
      <span style={dimStyle}>💨 {live.wind} km/h</span>
      <span style={dimStyle}>💧 {live.humidity}%</span>
      <span style={{ ...dimStyle, fontSize: 10 }}>Live · Victoria Park</span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const widgetStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '7px 14px',
  marginBottom: 16,
  flexWrap: 'wrap',
}

const tempStyle = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--text)',
}

const dimStyle = {
  fontSize: 12,
  color: 'var(--text-dim)',
}

const dividerStyle = {
  width: 1,
  height: 14,
  background: 'var(--border)',
  flexShrink: 0,
}
