'use client'
// components/DataDashboard.jsx

import { useState, useEffect, useCallback } from 'react'

const AFFILIATIONS = ['All', 'missionary', 'student', 'volunteer', 'provider']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)
const MONTHS = [
  { value: 0,  label: 'All months' },
  { value: 1,  label: 'January' },  { value: 2,  label: 'February' },
  { value: 3,  label: 'March' },    { value: 4,  label: 'April' },
  { value: 5,  label: 'May' },      { value: 6,  label: 'June' },
  { value: 7,  label: 'July' },     { value: 8,  label: 'August' },
  { value: 9,  label: 'September' },{ value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
]
const TOP_COUNT_OPTIONS = [5, 10, 25, 50]

// Records before this date are ignored for no-shows and late arrivals
const ATTENDANCE_CUTOFF = '2026-03-29'

function asUTC(ts) {
  if (!ts) return null
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

const pillStyle = (color, bg) => ({
  display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '100px',
  fontSize: '0.72rem', fontWeight: 600,
  background: bg || (color + '18'), color,
  border: `1px solid ${color}44`,
})

function Chevron({ open }) {
  return (
    <span style={{
      display: 'inline-block',
      transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s',
      color: 'var(--muted)',
      fontSize: '1.1rem',
      lineHeight: 1,
    }}>›</span>
  )
}

// Paginated fetch — loops with .range() until all rows are retrieved (handles 10k+)
async function fetchAllRows(supabase, table, buildQuery, pageSize = 1000) {
  let allRows = []
  let from = 0
  while (true) {
    const q = buildQuery(supabase.from(table)).range(from, from + pageSize - 1)
    const { data, error } = await q
    if (error) { console.error(`fetchAllRows(${table}) error:`, error); break }
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

export default function DataDashboard({ supabase }) {
  // ── Filter / collapse state ───────────────────────────────
  const [hoursMonth,  setHoursMonth]  = useState(new Date().getMonth() + 1)
  const [hoursYear,   setHoursYear]   = useState(CURRENT_YEAR)
  const [hoursAff,    setHoursAff]    = useState('All')
  const [hoursOpen,   setHoursOpen]   = useState(true)

  const [topMonth,    setTopMonth]    = useState(0)
  const [topYear,     setTopYear]     = useState(CURRENT_YEAR)
  const [topAff,      setTopAff]      = useState('All')
  const [topCount,    setTopCount]    = useState(10)
  const [topOpen,     setTopOpen]     = useState(true)

  const [noShowOpen,  setNoShowOpen]  = useState(true)
  const [lateOpen,    setLateOpen]    = useState(true)
  const [missingOpen, setMissingOpen] = useState(false)

  // ── Data state ────────────────────────────────────────────
  const [loading,       setLoading]       = useState(true)
  const [totalHoursVal, setTotalHoursVal] = useState(0)
  const [shiftCount,    setShiftCount]    = useState(0)
  const [noShows,       setNoShows]       = useState([])
  const [latePeople,    setLatePeople]    = useState([])
  const [topHours,      setTopHours]      = useState([])
  const [missingInfo,   setMissingInfo]   = useState([])
  const [profiles,      setProfiles]      = useState([])

  // Load ALL profiles (no role filter) so any affiliation resolves names
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, affiliation, sma_name, school, birthday, role')
      .then(({ data }) => setProfiles(data || []))
  }, [supabase])

  // ── Hours query — paginated ────────────────────────────────
  const loadHours = useCallback(async () => {
    let fromDate, toDate
    if (hoursMonth === 0) {
      fromDate = `${hoursYear}-01-01`
      toDate   = `${hoursYear}-12-31`
    } else {
      const mm = String(hoursMonth).padStart(2, '0')
      const lastDay = new Date(hoursYear, hoursMonth, 0).getDate()
      fromDate = `${hoursYear}-${mm}-01`
      toDate   = `${hoursYear}-${mm}-${lastDay}`
    }

    const affFilter = hoursAff
    const shiftsData = await fetchAllRows(supabase, 'shifts', (q) => {
      let query = q
        .select('volunteer_id, clock_in, clock_out, profiles!inner(affiliation)')
        .not('clock_out', 'is', null)
        .gte('clock_in', fromDate + 'T00:00:00Z')
        .lte('clock_in', toDate   + 'T23:59:59Z')
      if (affFilter !== 'All') query = query.eq('profiles.affiliation', affFilter)
      return query
    })

    let totalMs = 0
    ;(shiftsData || []).forEach(s => {
      totalMs += asUTC(s.clock_out) - asUTC(s.clock_in)
    })

    setTotalHoursVal((totalMs / 3600000).toFixed(1))
    setShiftCount((shiftsData || []).length)
  }, [supabase, hoursMonth, hoursYear, hoursAff])

  // ── Top hours — paginated, independent filters ─────────────
  const loadTopHours = useCallback(async () => {
    let fromDate, toDate
    if (topMonth === 0) {
      fromDate = `${topYear}-01-01`
      toDate   = `${topYear}-12-31`
    } else {
      const mm = String(topMonth).padStart(2, '0')
      const lastDay = new Date(topYear, topMonth, 0).getDate()
      fromDate = `${topYear}-${mm}-01`
      toDate   = `${topYear}-${mm}-${lastDay}`
    }

    const affFilter = topAff
    const shiftsData = await fetchAllRows(supabase, 'shifts', (q) => {
      const joinType = affFilter !== 'All' ? 'profiles!inner' : 'profiles'
      let query = q
        .select(`volunteer_id, clock_in, clock_out, ${joinType}(full_name, affiliation)`)
        .not('clock_out', 'is', null)
        .gte('clock_in', fromDate + 'T00:00:00Z')
        .lte('clock_in', toDate   + 'T23:59:59Z')
      if (affFilter !== 'All') query = query.eq('profiles.affiliation', affFilter)
      return query
    })

    const byVol = {}
    ;(shiftsData || []).forEach(s => {
      const dur = asUTC(s.clock_out) - asUTC(s.clock_in)
      if (!byVol[s.volunteer_id]) {
        const joinedName = s.profiles?.full_name
        const stateName  = profiles.find(p => p.id === s.volunteer_id)?.full_name
        byVol[s.volunteer_id] = { ms: 0, name: joinedName || stateName || 'Unknown' }
      }
      byVol[s.volunteer_id].ms += dur
    })

    const sorted = Object.entries(byVol)
      .map(([id, { ms, name }]) => ({ id, name, hours: (ms / 3600000).toFixed(1) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, topCount)

    setTopHours(sorted)
  }, [supabase, topMonth, topYear, topAff, topCount, profiles])

  // ── Attendance (no-shows + late) ──────────────────────────
  const loadAttendance = useCallback(async () => {
    // Fetch volunteer IDs who have any non-null/non-empty note in the schedule
    // table — these people are considered excused and are hidden from both lists.
    const { data: scheduledWithNotes } = await supabase
      .from('schedule')
      .select('volunteer_id')
      .not('notes', 'is', null)
      .neq('notes', '')

    const excusedIds = new Set(
      (scheduledWithNotes || []).map(r => r.volunteer_id).filter(Boolean)
    )

    // No-shows — from ATTENDANCE_CUTOFF onward, paginated
    const absentData = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id, shift_date, shift_time, role, profiles(full_name)')
        .eq('status', 'absent')
        .gte('shift_date', ATTENDANCE_CUTOFF)
        .order('shift_date', { ascending: false })
    )

    const absentMap = {}
    ;(absentData || []).forEach(r => {
      if (excusedIds.has(r.volunteer_id)) return
      if (!absentMap[r.volunteer_id]) absentMap[r.volunteer_id] = { records: [], name: null }
      if (!absentMap[r.volunteer_id].name) {
        absentMap[r.volunteer_id].name =
          r.profiles?.full_name ||
          profiles.find(p => p.id === r.volunteer_id)?.full_name ||
          'Unknown'
      }
      absentMap[r.volunteer_id].records.push(r)
    })

    setNoShows(
      Object.entries(absentMap)
        .map(([id, { name, records }]) => ({ id, name, count: records.length, records }))
        .sort((a, b) => b.count - a.count)
    )

    // Late arrivals — from ATTENDANCE_CUTOFF onward, paginated
    const lateData = await fetchAllRows(supabase, 'attendance_records', (q) =>
      q.select('volunteer_id, shift_date, shift_time, late_minutes, profiles(full_name)')
        .eq('status', 'late')
        .gte('shift_date', ATTENDANCE_CUTOFF)
        .order('shift_date', { ascending: false })
    )

    const lateMap = {}
    ;(lateData || []).forEach(r => {
      if (excusedIds.has(r.volunteer_id)) return
      if (!lateMap[r.volunteer_id]) {
        lateMap[r.volunteer_id] = {
          records: [],
          name:
            r.profiles?.full_name ||
            profiles.find(p => p.id === r.volunteer_id)?.full_name ||
            'Unknown',
        }
      }
      lateMap[r.volunteer_id].records.push(r)
    })

    setLatePeople(
      Object.entries(lateMap)
        .filter(([, { records }]) => records.length >= 2)
        .map(([id, { name, records }]) => ({
          id, name,
          count: records.length,
          avgLate: Math.round(
            records.reduce((s, r) => s + (r.late_minutes || 0), 0) / records.length
          ),
          records,
        }))
        .sort((a, b) => b.count - a.count)
    )
  }, [supabase, profiles])

  // ── Missing info — missionaries:sma, students:school, all:birthday ──
  useEffect(() => {
    if (!profiles.length) return
    const missing = profiles
      .filter(p => p.role === 'volunteer')
      .filter(p => {
        const needsSma    = p.affiliation === 'missionary' && !p.sma_name
        const needsSchool = p.affiliation === 'student'    && !p.school
        const needsBday   = !p.birthday
        return needsSma || needsSchool || needsBday
      })
      .map(p => ({
        id: p.id,
        name: p.full_name,
        affiliation: p.affiliation,
        missingSma:      p.affiliation === 'missionary' && !p.sma_name,
        missingSchool:   p.affiliation === 'student'    && !p.school,
        missingBirthday: !p.birthday,
        smaNA:    p.affiliation !== 'missionary',
        schoolNA: p.affiliation !== 'student',
      }))
    setMissingInfo(missing)
  }, [profiles])

  // ── Bootstrap on profiles load ────────────────────────────
  useEffect(() => {
    if (!profiles.length) return
    setLoading(true)
    Promise.all([loadHours(), loadTopHours(), loadAttendance()])
      .finally(() => setLoading(false))
  }, [profiles]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (profiles.length) loadHours()    }, [hoursMonth, hoursYear, hoursAff, loadHours])
  useEffect(() => { if (profiles.length) loadTopHours() }, [topMonth, topYear, topAff, topCount, loadTopHours])

  // ── Shared styles ─────────────────────────────────────────
  const card = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '1.5rem',
  }
  const sel = {
    padding: '0.45rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)', fontSize: '0.82rem',
    fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer',
  }
  const collapseBtn = {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: 0, fontFamily: 'DM Sans, sans-serif',
  }

  if (loading) return (
    <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
      Loading dashboard…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── 1. Hours Served (collapsible) ───────────────────── */}
      <div style={card}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          flexWrap: 'wrap', gap: '0.75rem',
          marginBottom: hoursOpen ? '1.25rem' : 0,
        }}>
          <button onClick={() => setHoursOpen(s => !s)} style={collapseBtn}>
            <Chevron open={hoursOpen} />
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Hours Served</span>
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={hoursMonth} onChange={e => setHoursMonth(Number(e.target.value))} style={sel}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={hoursYear} onChange={e => setHoursYear(Number(e.target.value))} style={sel}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={hoursAff} onChange={e => setHoursAff(e.target.value)} style={sel}>
              {AFFILIATIONS.map(a => <option key={a} value={a}>{a === 'All' ? 'All affiliations' : a}</option>)}
            </select>
          </div>
        </div>
        {hoursOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div style={{ padding: '1.25rem', background: 'rgba(2,65,107,0.06)', borderRadius: '10px', border: '1px solid rgba(2,65,107,0.25)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Total Hours</p>
              <p style={{ fontSize: '2.2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', lineHeight: 1 }}>
                {totalHoursVal}<span style={{ fontSize: '1rem', color: 'var(--muted)', fontWeight: 400, marginLeft: '0.25rem' }}>h</span>
              </p>
            </div>
            <div style={{ padding: '1.25rem', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Shift Records</p>
              <p style={{ fontSize: '2.2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)', lineHeight: 1 }}>{shiftCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. No-Shows (collapsible) ────────────────────────── */}
      <div style={card}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: noShowOpen && noShows.length > 0 ? '1rem' : 0,
        }}>
          <button onClick={() => setNoShowOpen(s => !s)} style={collapseBtn}>
            <Chevron open={noShowOpen} />
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>No-Shows</span>
            {noShows.length > 0 && (
              <span style={{ ...pillStyle('#ef4444'), fontWeight: 700 }}>{noShows.length}</span>
            )}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Since Mar 29 · unexcused absences</span>
        </div>
        {noShowOpen && (
          noShows.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.75rem' }}>No unexcused absences recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {noShows.map(v => {
                const isHigh = v.count >= 3
                return (
                  <div key={v.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.65rem 1rem', borderRadius: '8px', gap: '0.75rem', flexWrap: 'wrap',
                    background: isHigh ? 'rgba(239,68,68,0.05)' : 'var(--bg)',
                    border: `1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                  }}>
                    {/* No badge — just red name for high count */}
                    <span style={{ fontWeight: isHigh ? 700 : 500, fontSize: '0.9rem', color: isHigh ? '#ef4444' : 'var(--text)' }}>
                      {v.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.88rem', fontWeight: 700, color: isHigh ? '#ef4444' : 'var(--muted)' }}>
                        {v.count} absent
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Last: {fmtDate(v.records[0]?.shift_date)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* ── 3. Repeat Late (collapsible) ────────────────────── */}
      <div style={card}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: lateOpen && latePeople.length > 0 ? '1rem' : 0,
        }}>
          <button onClick={() => setLateOpen(s => !s)} style={collapseBtn}>
            <Chevron open={lateOpen} />
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Repeat Late Arrivals</span>
            {latePeople.length > 0 && (
              <span style={{ ...pillStyle('#f59e0b') }}>{latePeople.length}</span>
            )}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>≥2 times · since Mar 29</span>
        </div>
        {lateOpen && (
          latePeople.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.75rem' }}>No repeat late arrivals since Mar 29.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {latePeople.map(v => {
                const isHigh = v.count >= 4
                return (
                  <div key={v.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.65rem 1rem', borderRadius: '8px', gap: '0.75rem', flexWrap: 'wrap',
                    background: isHigh ? 'rgba(245,158,11,0.05)' : 'var(--bg)',
                    border: `1px solid ${isHigh ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {isHigh && (
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', fontWeight: 700 }}>
                          PATTERN
                        </span>
                      )}
                      <span style={{ fontWeight: isHigh ? 700 : 500, fontSize: '0.9rem', color: isHigh ? '#f59e0b' : 'var(--text)' }}>{v.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', fontWeight: 700, color: isHigh ? '#f59e0b' : 'var(--muted)' }}>
                        {v.count}× late
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>avg {v.avgLate}m</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* ── 4. Top Volunteers Leaderboard (collapsible) ─────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button onClick={() => setTopOpen(s => !s)} style={collapseBtn}>
            <Chevron open={topOpen} />
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Top Volunteers by Hours</span>
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={topCount} onChange={e => setTopCount(Number(e.target.value))} style={sel}>
              {TOP_COUNT_OPTIONS.map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
            <select value={topMonth} onChange={e => setTopMonth(Number(e.target.value))} style={sel}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={topYear} onChange={e => setTopYear(Number(e.target.value))} style={sel}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={topAff} onChange={e => setTopAff(e.target.value)} style={sel}>
              {AFFILIATIONS.map(a => <option key={a} value={a}>{a === 'All' ? 'All affiliations' : a}</option>)}
            </select>
          </div>
        </div>
        {topOpen && (
          <div style={{ marginTop: '1.25rem' }}>
            {topHours.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No hours recorded for this period.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {topHours.map((v, i) => {
                  const maxHrs = parseFloat(topHours[0]?.hours || 1)
                  const pct = Math.round((parseFloat(v.hours) / maxHrs) * 100)
                  const isFirst = i === 0
                  return (
                    <div key={v.id} style={{ padding: '0.6rem 1rem', background: isFirst ? 'rgba(2,65,107,0.06)' : 'var(--bg)', borderRadius: '8px', border: `1px solid ${isFirst ? 'rgba(2,65,107,0.3)' : 'var(--border)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: 'var(--muted)', width: '20px', textAlign: 'right' }}>#{i + 1}</span>
                          <span style={{ fontWeight: isFirst ? 700 : 500, fontSize: '0.88rem', color: isFirst ? 'var(--accent)' : 'var(--text)' }}>{v.name}</span>
                        </div>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', fontWeight: 700, color: isFirst ? 'var(--accent)' : 'var(--text)' }}>
                          {v.hours}h
                        </span>
                      </div>
                      <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: isFirst ? 'var(--accent)' : 'rgba(2,65,107,0.35)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 5. Missing Profile Info (collapsible) ───────────── */}
      <div style={card}>
        <button
          onClick={() => setMissingOpen(s => !s)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'DM Sans, sans-serif' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Chevron open={missingOpen} />
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Missing Profile Information</span>
            {missingInfo.length > 0 && (
              <span style={{ ...pillStyle('#9ca3af'), fontWeight: 600 }}>{missingInfo.length}</span>
            )}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            missionaries: sma · students: school · all: birthday
          </span>
        </button>
        {missingOpen && (
          <div style={{ marginTop: '1.25rem' }}>
            {missingInfo.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>All volunteers have complete profile information.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', padding: '0.35rem 1rem' }}>
                  {['Name','SMA','School','Birthday'].map(h => (
                    <span key={h} style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                  ))}
                </div>
                {missingInfo.map(v => (
                  <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', padding: '0.55rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{v.name}</span>
                      {v.affiliation && (
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic' }}>{v.affiliation}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', ...(v.smaNA ? { color: 'var(--muted)', fontStyle: 'italic' } : v.missingSma ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                      {v.smaNA ? 'N/A' : v.missingSma ? 'Missing' : '✓'}
                    </span>
                    <span style={{ fontSize: '0.75rem', ...(v.schoolNA ? { color: 'var(--muted)', fontStyle: 'italic' } : v.missingSchool ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                      {v.schoolNA ? 'N/A' : v.missingSchool ? 'Missing' : '✓'}
                    </span>
                    <span style={{ fontSize: '0.75rem', ...(v.missingBirthday ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                      {v.missingBirthday ? 'Missing' : '✓'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}