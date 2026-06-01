import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const EventContext = createContext(null)

export function EventProvider({ children }) {
  const { eventId } = useParams()

  const [event,        setEvent]        = useState(null)
  const [days,         setDays]         = useState([])
  const [onTrack,      setOnTrack]      = useState([])
  const [areas,        setAreas]        = useState([])
  const [areaSessions, setAreaSessions] = useState([])
  const [people,       setPeople]       = useState([])
  const [departments,  setDepartments]  = useState([])
  const [slipLog,      setSlipLog]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  const loadAll = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    setError(null)
    try {
      const [
        { data: ev },
        { data: ds },
        { data: ot },
        { data: ar },
        { data: as_ },
        { data: pe },
        { data: dept },
        { data: sl },
      ] = await Promise.all([
        supabase.from('events').select('*').eq('id', eventId).single(),
        supabase.from('days').select('*').eq('event_id', eventId).order('sort_order'),
        supabase.from('on_track_sessions').select('*').eq('event_id', eventId).order('start_mins'),
        supabase.from('areas').select('*').eq('event_id', eventId),
        supabase.from('area_sessions').select('*').eq('event_id', eventId),
        supabase.from('people').select('*, people_on_track(session_id), people_area_sessions(area_session_id)').eq('event_id', eventId),
        supabase.from('departments').select('*').eq('event_id', eventId).order('sort_order'),
        supabase.from('slip_log').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(50),
      ])

      setEvent(ev)
      setDays(ds || [])
      setOnTrack(ot || [])
      setAreas(ar || [])
      setAreaSessions(as_ || [])
      setPeople(pe || [])
      setDepartments(dept || [])
      setSlipLog(sl || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Real-time subscription — any change to the event's core tables re-fetches
  useEffect(() => {
    if (!eventId) return

    const channel = supabase
      .channel(`event-${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'on_track_sessions',
        filter: `event_id=eq.${eventId}`,
      }, () => loadAll())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'area_sessions',
        filter: `event_id=eq.${eventId}`,
      }, () => loadAll())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'slip_log',
        filter: `event_id=eq.${eventId}`,
      }, () => loadAll())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'people',
        filter: `event_id=eq.${eventId}`,
      }, () => loadAll())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'departments',
        filter: `event_id=eq.${eventId}`,
      }, () => loadAll())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [eventId, loadAll])

  return (
    <EventContext.Provider value={{
      eventId,
      event,
      days,
      onTrack,
      areas,
      areaSessions,
      people,
      departments,
      slipLog,
      loading,
      error,
      reload: loadAll,
      // Convenience setters for optimistic updates
      setOnTrack,
      setSlipLog,
    }}>
      {children}
    </EventContext.Provider>
  )
}

export function useEvent() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEvent must be used inside <EventProvider>')
  return ctx
}
