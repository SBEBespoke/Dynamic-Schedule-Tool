import { useState, useEffect } from 'react'

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

export default function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m` +
      `&wind_speed_unit=kmh&timezone=Australia%2FAdelaide`

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const c = data.current
        setWeather({
          temp:       Math.round(c.temperature_2m),
          feelsLike:  Math.round(c.apparent_temperature),
          code:       c.weather_code,
          wind:       Math.round(c.wind_speed_10m),
          humidity:   c.relative_humidity_2m,
        })
      })
      .catch(() => setError(true))
  }, [])

  if (error) return null // fail silently — don't break the schedule view

  if (!weather) {
    return (
      <div style={widgetStyle}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🌡 Loading weather…</span>
      </div>
    )
  }

  const icon = WMO_ICONS[weather.code] || '🌡'
  const desc = WMO_DESCRIPTIONS[weather.code] || 'Unknown'

  return (
    <div style={widgetStyle} title="Victoria Park, Adelaide — via open-meteo.com">
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={tempStyle}>{weather.temp}°C</span>
      <span style={dimStyle}>{desc}</span>
      <span style={divider} />
      <span style={dimStyle}>💨 {weather.wind} km/h</span>
      <span style={dimStyle}>💧 {weather.humidity}%</span>
      <span style={{ ...dimStyle, fontSize: 10 }}>Victoria Park</span>
    </div>
  )
}

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

const divider = {
  width: 1,
  height: 14,
  background: 'var(--border)',
  flexShrink: 0,
}
