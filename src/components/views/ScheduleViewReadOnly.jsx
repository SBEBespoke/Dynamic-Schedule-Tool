import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { fromMins, durStr, otStart, otEnd, otAdjusted } from '../../lib/time'
import { useWeather, precipEmoji, precipColor } from '../../lib/useWeather'
import WeatherWidget from '../WeatherWidget'

export default function ScheduleViewReadOnly() {
  const { days, onTrack, people, reload } = useEvent()
  const { getWeather, getDayWeather, dateInWindow } = useWeather(days)
  const { profile } = useAuth()
  const { toast } = useToast()

  const me = people.find(p => p.linked_user_id === profile?.id)

  const [activeDay, setActiveDay] = useState(null)
  const [joining,   setJoining]   = useState(null)

  async function toggleJoin(s) {
    if (!me) return
    setJoining(s.id)
    const isJoined = me.people_on_track?.some(pot => pot.session_id === s.id)
    if (isJoined) {
      await supabase.from('people_on_track').delete().eq('person_id', me.id).eq('session_id', s.id)
    } else {
      const { error } = await supabase.from('people_on_track').insert([{ person_id: me.id, session_id: s.id }])
      if (error) toast('Error', error.message, 'danger')
    }
    setJoining(null)
    reload()
  }

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  // Auto-select first day
  useEffect(() => {
    if (sortedDays.length > 0 && !activeDay) setActiveDay(sortedDays[0].id)
  }, [sortedDays, activeDay])

  const activeDay_ = sortedDays.find(d => d.id === activeDay)

  // Sessions for the active day, sorted by current start time (slip-adjusted)
  const daySessions = onTrack
    .filter(s => s.day_id === activeDay)
    .sort((a, b) => {
      const aStart = otAdjusted(a) ? otStart(a) : a.start_mins
      const bStart = otAdjusted(b) ? otStart(b) : b.start_mins
      return aStart - bStart
    })

  // Are any sessions slipped today?
  const hasSlips = daySessions.some(s => otAdjusted(s))

  return (
    <div>
      {/* ── Day tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="day-tabs" style={{ margin: 0 }}>
          {sortedDays.map(d => (
            <button
              key={d.id}
              className={`day-tab ${activeDay === d.id ? 'active' : ''}`}
              onClick={() => setActiveDay(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Weather ── */}
      <WeatherWidget
        dayForecast={getDayWeather(activeDay_?.date)}
        dayName={activeDay_?.name}
      />
      {activeDay_?.date && !dateInWindow(activeDay_.date) && (
        <div style={{
          fontSize: 11, color: 'var(--text-dim)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 7, padding: '6px 12px', marginBottom: 14,
          display: 'inline-block',
        }}>
          🌡 Session forecasts will appear here within 16 days of the event
        </div>
      )}

      {/* ── Slip alert banner ── */}
      {hasSlips && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(249,115,22,0.08)',
          border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          fontSize: 13, color: 'var(--warning)', fontWeight: 600,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          Schedule has changed — updated times are shown below
        </div>
      )}

      {/* ── No days yet ── */}
      {sortedDays.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>📅</div>
          No days set up yet.
        </div>
      )}

      {/* ── Sessions ── */}
      {activeDay_ && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span className="sec-title">On-Track Sessions</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>({daySessions.length})</span>
          </div>

          {daySessions.length === 0 ? (
            <div className="empty">No sessions on this day yet.</div>
          ) : (
            daySessions.map(s => {
              const adjusted  = otAdjusted(s)
              const startDisp = adjusted ? otStart(s) : s.start_mins
              const endDisp   = adjusted ? otEnd(s)   : s.start_mins + s.duration_mins
              const wx        = getWeather(activeDay_?.date, s.start_mins)
              const isJoined  = me?.people_on_track?.some(pot => pot.session_id === s.id)

              return (
                <div
                  key={s.id}
                  className={`session-item ${adjusted ? 'slipped' : ''}`}
                >
                  {/* Time block */}
                  <div className={`s-time ${adjusted ? 'slipped' : ''}`}>
                    {fromMins(startDisp)}
                    <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--text-dim)' }}>
                      → {fromMins(endDisp)}
                    </span>
                    {/* Original time strikethrough if slipped */}
                    {adjusted && s.start_mins !== startDisp && (
                      <div className="s-orig">{fromMins(s.start_mins)}</div>
                    )}
                  </div>

                  {/* Category + name + weather */}
                  <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{s.category || 'General'}</span>
                      {s.notes && (
                        <span title={s.notes} style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'help' }}>📋</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>{s.name}</span>
                    {wx && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: wx.precipProb >= 30 ? 700 : 400,
                        color: precipColor(wx.precipProb),
                        marginTop: 1,
                      }}>
                        {precipEmoji(wx.precipProb)} {wx.temp}°C
                        {wx.precipProb > 0 && (
                          <span> · {wx.precipProb}% rain{wx.precip > 0 ? ` (${wx.precip}mm)` : ''}</span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Duration */}
                  <div className="s-dur">{durStr(s.duration_override ?? s.duration_mins)}</div>

                  {/* Slip pills */}
                  {(s.slip_mins || 0) !== 0 && (
                    <span className="slip-pill">+{s.slip_mins}m</span>
                  )}
                  {(s.cascade_slip_mins || 0) > 0 && (
                    <span className="slip-pill cascade" title="Auto-cascaded">↓ +{s.cascade_slip_mins}m</span>
                  )}

                  {/* Join / Leave */}
                  {me && (
                    <button
                      className={`btn btn-xs ${isJoined ? 'btn-warning' : 'btn-ghost'}`}
                      style={{ flexShrink: 0 }}
                      disabled={joining === s.id}
                      onClick={() => toggleJoin(s)}
                    >
                      {isJoined ? '✓ Joined' : '+ Join'}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}
