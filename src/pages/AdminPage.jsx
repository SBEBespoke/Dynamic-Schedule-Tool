import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { EventProvider, useEvent } from '../context/EventContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { toMins } from '../lib/time'
import UsersTab       from '../components/admin/UsersTab'
import DepartmentsTab from '../components/admin/DepartmentsTab'

const TABS = ['Event Config', 'Departments', 'Excel Import', 'Users']

function AdminShell() {
  const navigate = useNavigate()
  const { event, eventId, days, reload } = useEvent()
  const { isSuperAdmin } = useAuth()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('Event Config')

  if (!isSuperAdmin) return (
    <div className="page-loading" style={{ color: 'var(--danger)' }}>
      Access denied — Super Admin only.
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/event/${eventId}`)}>
            ‹ Back to Event
          </button>
          <div>
            <div style={styles.title}>⚙ Admin</div>
            <div style={styles.sub}>{event?.name}</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <nav style={styles.nav}>
        {TABS.map(t => (
          <button
            key={t}
            style={{ ...styles.navBtn, ...(activeTab === t ? styles.navBtnActive : {}) }}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="main" style={{ maxWidth: 800 }}>
        {activeTab === 'Event Config' && <EventConfig event={event} eventId={eventId} reload={reload} />}
        {activeTab === 'Departments'  && <DepartmentsTab />}
        {activeTab === 'Excel Import' && <ExcelImport eventId={eventId} days={days} reload={reload} />}
        {activeTab === 'Users'        && <UsersTab />}
      </main>
    </div>
  )
}

// ── Event Config ──────────────────────────────────────────────────────────────
function EventConfig({ event, eventId, reload }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:            event?.name            || '',
    venue:           event?.venue           || '',
    start_date:      event?.start_date      || '',
    end_date:        event?.end_date        || '',
    pam_nav_map_id:  event?.pam_nav_map_id  || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('events').update({
      name:           form.name.trim(),
      venue:          form.venue.trim() || null,
      start_date:     form.start_date  || null,
      end_date:       form.end_date    || null,
      pam_nav_map_id: form.pam_nav_map_id.trim() || null,
    }).eq('id', eventId)

    if (error) toast('Error', error.message, 'danger')
    else { toast('Saved', 'Event details updated', 'success'); reload() }
    setSaving(false)
  }

  return (
    <div className="card">
      <div className="card-label" style={{ marginBottom: 18 }}>Event Details</div>
      <form onSubmit={handleSave}>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Event Name *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Venue</label>
          <input value={form.venue} onChange={e => set('venue', e.target.value)} placeholder="e.g. Adelaide Parklands Circuit" />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>PAM SmartMap ID</label>
          <input
            value={form.pam_nav_map_id}
            onChange={e => set('pam_nav_map_id', e.target.value)}
            placeholder="e.g. 0ecdfc1f-4e42-4c76-af14-32d3bf149b99"
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            The <code>navmapId</code> from your PAM SmartMap URL. Enables directions links on activation cards.
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Excel Import ──────────────────────────────────────────────────────────────
const REQUIRED_COLS = ['Session Name', 'Start Time', 'Duration (mins)']
const OPTIONAL_COLS = ['Day', 'Category', 'Notes']
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS]

function ExcelImport({ eventId, days, reload }) {
  const { toast } = useToast()
  const { onTrack } = useEvent()
  const fileRef = useRef()

  const [headers,  setHeaders]  = useState([])
  const [rows,     setRows]     = useState([])
  const [mapping,  setMapping]  = useState({})
  const [importing, setImporting] = useState(false)
  const [result,   setResult]   = useState(null)
  const [replaceAll, setReplaceAll] = useState(true)

  function handleExport() {
    if (!onTrack || onTrack.length === 0) {
      toast('Nothing to export', 'No on-track sessions found', 'danger')
      return
    }
    // Build a day lookup id → name
    const dayNames = {}
    days.forEach(d => { dayNames[d.id] = d.name })

    const exportRows = onTrack.map(s => {
      const totalMins = s.start_mins
      const hh = String(Math.floor(totalMins / 60)).padStart(2, '0')
      const mm = String(totalMins % 60).padStart(2, '0')
      return {
        'Day':            dayNames[s.day_id] || '',
        'Session Name':   s.name || '',
        'Category':       s.category || '',
        'Start Time':     `${hh}:${mm}`,
        'Duration (mins)': s.duration_mins || '',
        'Notes':          s.notes || '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportRows, {
      header: ['Day', 'Session Name', 'Category', 'Start Time', 'Duration (mins)', 'Notes'],
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule')
    XLSX.writeFile(wb, 'on-track-schedule.xlsx')
    toast('Exported', `${exportRows.length} sessions downloaded`, 'success')
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const hdrs = (json[0] || []).map(String)
      const dataRows = json.slice(1).filter(r => r.some(c => c != null && c !== ''))
      setHeaders(hdrs)
      setRows(dataRows)
      setResult(null)

      // Auto-map columns by name similarity
      const autoMap = {}
      ALL_COLS.forEach(col => {
        const match = hdrs.find(h =>
          h.toLowerCase().includes(col.toLowerCase().split(' ')[0])
        )
        if (match) autoMap[col] = match
      })
      setMapping(autoMap)
    }
    reader.readAsBinaryString(file)
  }

  function getVal(row, col) {
    const header = mapping[col]
    if (!header) return ''
    const idx = headers.indexOf(header)
    return idx >= 0 ? String(row[idx] ?? '').trim() : ''
  }

  async function handleImport() {
    // Validate required mappings
    for (const col of REQUIRED_COLS) {
      if (!mapping[col]) { toast('Missing mapping', `Please map the "${col}" column`, 'danger'); return }
    }

    setImporting(true)
    setResult(null)

    let created = 0, skipped = 0, errors = []

    // ── Delete existing sessions if Replace mode is on ──────────────
    if (replaceAll) {
      const { error: delErr } = await supabase
        .from('on_track_sessions')
        .delete()
        .eq('event_id', eventId)
      if (delErr) {
        toast('Delete failed', delErr.message, 'danger')
        setImporting(false)
        return
      }
    }

    // Build a day lookup (name → id), creating days as needed
    const dayMap = {}
    days.forEach(d => { dayMap[d.name.toLowerCase()] = d.id })

    for (const row of rows) {
      const name     = getVal(row, 'Session Name')
      const timeStr  = getVal(row, 'Start Time')
      const durStr   = getVal(row, 'Duration (mins)')
      const dayName  = getVal(row, 'Day')
      const category = getVal(row, 'Category') || 'General'
      const notes    = getVal(row, 'Notes')

      if (!name || !timeStr || !durStr) { skipped++; continue }

      // Parse start time — handle both "9:00", "09:00", and Excel serial numbers
      let startMins = 0
      if (typeof row[headers.indexOf(mapping['Start Time'])] === 'number') {
        // Excel stores times as fractions of a day
        const frac = row[headers.indexOf(mapping['Start Time'])]
        startMins = Math.round(frac * 24 * 60)
      } else {
        startMins = toMins(timeStr.includes(':') ? timeStr : timeStr.padStart(5, '0'))
      }

      const durationMins = parseInt(durStr, 10)
      if (isNaN(durationMins) || durationMins <= 0) { skipped++; continue }

      // Resolve day
      let dayId = null
      if (dayName) {
        const key = dayName.toLowerCase()
        if (!dayMap[key]) {
          // Create the day
          const { data: newDay, error: dayErr } = await supabase
            .from('days')
            .insert([{ event_id: eventId, name: dayName, sort_order: Object.keys(dayMap).length }])
            .select()
            .single()
          if (dayErr) { errors.push(`Day "${dayName}": ${dayErr.message}`); continue }
          dayMap[key] = newDay.id
        }
        dayId = dayMap[key]
      } else if (days.length > 0) {
        dayId = days[0].id
      } else {
        errors.push(`Row "${name}": no day specified and no days exist yet`); continue
      }

      const { error } = await supabase.from('on_track_sessions').insert([{
        event_id:      eventId,
        day_id:        dayId,
        name,
        category,
        start_mins:    startMins,
        duration_mins: durationMins,
        notes:         notes || null,
        slip_mins:     0,
        cascade_slip_mins: 0,
      }])

      if (error) errors.push(`"${name}": ${error.message}`)
      else created++
    }

    await reload()
    setImporting(false)
    setResult({ created, skipped, errors })
    if (created > 0) toast('Import complete', `${created} session${created !== 1 ? 's' : ''} imported`, 'success')
    if (errors.length > 0) toast('Some rows failed', `${errors.length} error${errors.length !== 1 ? 's' : ''}`, 'warn')
  }

  const preview = rows.slice(0, 5)

  return (
    <div>
      {/* Export */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="card-label" style={{ marginBottom: 4 }}>Export Current Schedule</div>
          <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: 0 }}>
            Download the current on-track sessions as an Excel file — use this as a template for re-importing.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>
          ⬇ Export to Excel
        </button>
      </div>

      {/* Upload */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-label" style={{ marginBottom: 14 }}>Upload Schedule File</div>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14, lineHeight: 1.6 }}>
          Upload an Excel file (.xlsx or .xls) containing your on-track session schedule.
          The first row should be column headers. You'll map the columns below.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <button className="btn btn-primary" onClick={() => fileRef.current.click()}>
          📂 Choose Excel File
        </button>
        {rows.length > 0 && (
          <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--success)' }}>
            ✓ {rows.length} data rows loaded
          </span>
        )}
      </div>

      {/* Column mapping */}
      {headers.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-label" style={{ marginBottom: 14 }}>Map Columns</div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            Match each field to the column in your spreadsheet. Required fields are marked *.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
            {ALL_COLS.map(col => (
              <div className="form-group" key={col} style={{ marginBottom: 0 }}>
                <label>
                  {col} {REQUIRED_COLS.includes(col) ? '*' : ''}
                </label>
                <select value={mapping[col] || ''} onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}>
                  <option value="">— not mapped —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
          <div className="card-label" style={{ marginBottom: 12 }}>Preview (first 5 rows)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {ALL_COLS.map(col => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  {ALL_COLS.map(col => (
                    <td key={col} style={tdStyle}>{getVal(row, col) || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import options + button */}
      {rows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '10px 14px', borderRadius: 8,
            background: replaceAll ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
            border: `1px solid ${replaceAll ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          }}>
            <input
              type="checkbox"
              id="replaceAll"
              checked={replaceAll}
              onChange={e => setReplaceAll(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="replaceAll" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
              <strong>Replace existing schedule</strong>
              <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>
                {replaceAll
                  ? '— deletes all current sessions before importing'
                  : '— adds new sessions without removing existing ones'}
              </span>
            </label>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? 'Importing…' : `⬆ ${replaceAll ? 'Replace Schedule' : 'Add'} (${rows.length} sessions)`}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card" style={{ borderColor: result.errors.length ? 'rgba(249,115,22,0.3)' : 'rgba(34,197,94,0.3)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div>✅ <strong>{result.created}</strong> session{result.created !== 1 ? 's' : ''} imported</div>
            {result.skipped > 0 && <div>⏭ <strong>{result.skipped}</strong> rows skipped (missing required fields)</div>}
            {result.errors.map((err, i) => (
              <div key={i} style={{ color: 'var(--danger)' }}>⚠ {err}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  header: {
    background: 'var(--surface)', borderBottom: '2px solid var(--accent)',
    padding: '10px 20px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100,
  },
  title: { fontSize: '14px', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--accent)', textTransform: 'uppercase' },
  sub:   { fontSize: '11px', color: 'var(--text-dim)', marginTop: 2 },
  nav:   { display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', overflowX: 'auto' },
  navBtn: {
    padding: '11px 18px', border: 'none', background: 'none', color: 'var(--text-dim)',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
    borderBottom: '2px solid transparent', transition: 'color 0.15s, border-color 0.15s',
  },
  navBtnActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
}

const thStyle = {
  textAlign: 'left', padding: '6px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px',
}
const tdStyle = {
  padding: '6px 10px', borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
}

// ── Export ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  return (
    <EventProvider>
      <AdminShell />
    </EventProvider>
  )
}
