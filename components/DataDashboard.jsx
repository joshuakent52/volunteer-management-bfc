'use client'
// components/DataDashboard.jsx
// ─────────────────────────────────────────────────────────────
// Self-contained data dashboard tab for the admin page.
// Drop-in: <DataDashboard supabase={supabase} />
//
// Sections:
//  1. Hours Served  — filterable by month / year / affiliation
//  2. No-Shows      — attendance_records where status = 'absent'
//  3. Repeat Late   — ≥2 late records in the past month
//  4. Top Hours     — filterable leaderboard
//  5. Missing Info  — profiles with null sma_name/school/birthday
// ─────────────────────────────────────────────────────────────

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

function asUTC(ts) {
  if (!ts) return null
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

// ── pill / badge helpers ──────────────────────────────────────
const pillStyle = (color, bg) => ({
  display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '100px',
  fontSize: '0.72rem', fontWeight: 600,
  background: bg || (color + '18'), color,
  border: `1px solid ${color}44`,
})

export default function DataDashboard({ supabase }) {
  // ── Filter state ──────────────────────────────────────────
  const [hoursMonth,    setHoursMonth]    = useState(new Date().getMonth() + 1)
  const [hoursYear,     setHoursYear]     = useState(CURRENT_YEAR)
  const [hoursAff,      setHoursAff]      = useState('All')

  const [topMonth,      setTopMonth]      = useState(0)  // 0 = all
  const [topYear,       setTopYear]       = useState(CURRENT_YEAR)
  const [topAff,        setTopAff]        = useState('All')

  // ── Data state ────────────────────────────────────────────
  const [loading,       setLoading]       = useState(true)
  const [totalHoursVal, setTotalHoursVal] = useState(0)
  const [shiftCount,    setShiftCount]    = useState(0)
  const [noShows,       setNoShows]       = useState([])
  const [latePeople,    setLatePeople]    = useState([])
  const [topHours,      setTopHours]      = useState([])
  const [missingInfo,   setMissingInfo]   = useState([])
  const [showMissing,   setShowMissing]   = useState(false)
  const [profiles,      setProfiles]      = useState([])

  // Load profiles once (needed for name lookups + missing-info)
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, affiliation, sma_name, school, birthday, role')
      .eq('role', 'volunteer')
      .then(({ data }) => setProfiles(data || []))
  }, [supabase])

  // ── Hours / top-hours query ────────────────────────────────
  const loadHours = useCallback(async () => {
    // Build date range for filter
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

    // Pull shifts in range — join profiles for affiliation filter
    let q = supabase
      .from('shifts')
      .select('volunteer_id, clock_in, clock_out, profiles!inner(affiliation)')
      .not('clock_out', 'is', null)
      .gte('clock_in', fromDate + 'T00:00:00Z')
      .lte('clock_in', toDate   + 'T23:59:59Z')

    if (hoursAff !== 'All') q = q.eq('profiles.affiliation', hoursAff)

    const { data: shiftsData } = await q

    let totalMs = 0
    const byVolunteer = {}
    ;(shiftsData || []).forEach(s => {
      const dur = asUTC(s.clock_out) - asUTC(s.clock_in)
      totalMs += dur
      if (!byVolunteer[s.volunteer_id]) byVolunteer[s.volunteer_id] = 0
      byVolunteer[s.volunteer_id] += dur
    })

    setTotalHoursVal((totalMs / 3600000).toFixed(1))
    setShiftCount((shiftsData || []).length)

    // Top 10 leaderboard (reuses same filter)
    const sorted = Object.entries(byVolunteer)
      .map(([id, ms]) => {
        const vol = profiles.find(p => p.id === id)
        return { id, name: vol?.full_name || 'Unknown', hours: (ms / 3600000).toFixed(1) }
      })
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10)

    setTopHours(sorted)
  }, [supabase, hoursMonth, hoursYear, hoursAff, profiles])

  // ── Top-hours has its own separate filter set ──────────────
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

    let q = supabase
      .from('shifts')
      .select('volunteer_id, clock_in, clock_out, profiles!inner(affiliation, full_name)')
      .not('clock_out', 'is', null)
      .gte('clock_in', fromDate + 'T00:00:00Z')
      .lte('clock_in', toDate   + 'T23:59:59Z')

    if (topAff !== 'All') q = q.eq('profiles.affiliation', topAff)

    const { data: shiftsData } = await q

    const byVol = {}
    ;(shiftsData || []).forEach(s => {
      const dur = asUTC(s.clock_out) - asUTC(s.clock_in)
      if (!byVol[s.volunteer_id]) {
        byVol[s.volunteer_id] = { ms: 0, name: s.profiles?.full_name || 'Unknown' }
      }
      byVol[s.volunteer_id].ms += dur
    })

    const sorted = Object.entries(byVol)
      .map(([id, { ms, name }]) => ({ id, name, hours: (ms / 3600000).toFixed(1) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10)

    setTopHours(sorted)
  }, [supabase, topMonth, topYear, topAff])

  // ── Attendance queries (no-show + late) ────────────────────
  const loadAttendance = useCallback(async () => {
    // Last 30 days for no-shows and late
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]

    // No-shows — any time in attendance_records history
    const { data: absentData } = await supabase
      .from('attendance_records')
      .select('volunteer_id, shift_date, shift_time, role')
      .eq('status', 'absent')
      .order('shift_date', { ascending: false })
      .limit(500)

    // Group no-shows by volunteer
    const absentMap = {}
    ;(absentData || []).forEach(r => {
      if (!absentMap[r.volunteer_id]) absentMap[r.volunteer_id] = []
      absentMap[r.volunteer_id].push(r)
    })

    const noShowList = Object.entries(absentMap)
      .map(([id, records]) => ({
        id,
        name: profiles.find(p => p.id === id)?.full_name || 'Unknown',
        count: records.length,
        records,
      }))
      .sort((a, b) => b.count - a.count)

    setNoShows(noShowList)

    // Late — past 30 days, ≥2 occurrences
    const { data: lateData } = await supabase
      .from('attendance_records')
      .select('volunteer_id, shift_date, shift_time, late_minutes')
      .eq('status', 'late')
      .gte('shift_date', thirtyDaysAgo)
      .order('shift_date', { ascending: false })

    const lateMap = {}
    ;(lateData || []).forEach(r => {
      if (!lateMap[r.volunteer_id]) lateMap[r.volunteer_id] = []
      lateMap[r.volunteer_id].push(r)
    })

    const lateList = Object.entries(lateMap)
      .filter(([, records]) => records.length >= 2)
      .map(([id, records]) => ({
        id,
        name: profiles.find(p => p.id === id)?.full_name || 'Unknown',
        count: records.length,
        avgLate: Math.round(records.reduce((s, r) => s + (r.late_minutes || 0), 0) / records.length),
        records,
      }))
      .sort((a, b) => b.count - a.count)

    setLatePeople(lateList)
  }, [supabase, profiles])

  // ── Missing info query ─────────────────────────────────────
  useEffect(() => {
    if (!profiles.length) return
    const missing = profiles.filter(p =>
      p.role === 'volunteer' &&
      (!p.sma_name || !p.school || !p.birthday)
    ).map(p => ({
      id: p.id,
      name: p.full_name,
      affiliation: p.affiliation,
      missingSma:     !p.sma_name,
      missingSchool:  !p.school,
      missingBirthday: !p.birthday,
    }))
    setMissingInfo(missing)
  }, [profiles])

  // Run all queries on mount + when profiles load
  useEffect(() => {
    if (!profiles.length) return
    setLoading(true)
    Promise.all([loadHours(), loadAttendance()]).finally(() => setLoading(false))
  }, [profiles, loadHours, loadAttendance])

  // Re-run hours when filter changes
  useEffect(() => { if (profiles.length) loadHours() }, [hoursMonth, hoursYear, hoursAff, loadHours])
  useEffect(() => { if (profiles.length) loadTopHours() }, [topMonth, topYear, topAff, loadTopHours])

  // ── Styles ────────────────────────────────────────────────
  const card = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '1.5rem',
  }
  const sel = {
    padding: '0.45rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)', fontSize: '0.82rem',
    fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer',
  }
  const sectionTitle = { fontWeight: 600, fontSize: '1rem', marginBottom: '1rem' }

  if (loading) return (
    <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
      Loading dashboard…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── 1. Hours Served ─────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <h2 style={sectionTitle}>Hours Served</h2>
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
      </div>

      {/* ── 2. No-Shows ─────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>
            No-Shows
            {noShows.length > 0 && (
              <span style={{ marginLeft: '0.5rem', ...pillStyle('#ef4444'), fontWeight: 700 }}>{noShows.length}</span>
            )}
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>All time · unexcused absences</span>
        </div>
        {noShows.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No unexcused absences recorded.</p>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {isHigh && (
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700 }}>
                        HIGH RISK
                      </span>
                    )}
                    <span style={{ fontWeight: isHigh ? 700 : 500, fontSize: '0.9rem', color: isHigh ? '#ef4444' : 'var(--text)' }}>{v.name}</span>
                  </div>
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
        )}
      </div>

      {/* ── 3. Repeat Late (past 30 days) ───────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>
            Repeat Late Arrivals
            {latePeople.length > 0 && (
              <span style={{ marginLeft: '0.5rem', ...pillStyle('#f59e0b') }}>{latePeople.length}</span>
            )}
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>≥2 times · past 30 days</span>
        </div>
        {latePeople.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No repeat late arrivals in the past 30 days.</p>
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
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      avg {v.avgLate}m
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 4. Top Hours Leaderboard ─────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Top Volunteers by Hours</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: 'var(--muted)', width: '20px', textAlign: 'right' }}>
                        #{i + 1}
                      </span>
                      <span style={{ fontWeight: isFirst ? 700 : 500, fontSize: '0.88rem', color: isFirst ? 'var(--accent)' : 'var(--text)' }}>{v.name}</span>
                    </div>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', fontWeight: 700, color: isFirst ? 'var(--accent)' : 'var(--text)' }}>
                      {v.hours}h
                    </span>
                  </div>
                  {/* Bar */}
                  <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: isFirst ? 'var(--accent)' : 'rgba(2,65,107,0.35)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 5. Missing Profile Info (collapsible) ───────────── */}
      <div style={card}>
        <button
          onClick={() => setShowMissing(s => !s)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'DM Sans, sans-serif' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ display: 'inline-block', transform: showMissing ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--muted)' }}>›</span>
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Missing Profile Information</span>
            {missingInfo.length > 0 && (
              <span style={{ ...pillStyle('#9ca3af'), fontWeight: 600 }}>{missingInfo.length}</span>
            )}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            sma_name · school · birthday
          </span>
        </button>

        {showMissing && (
          <div style={{ marginTop: '1.25rem' }}>
            {missingInfo.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>All volunteers have complete profile information.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', padding: '0.35rem 1rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Name</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SMA</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>School</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Birthday</span>
                </div>
                {missingInfo.map(v => (
                  <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', padding: '0.55rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{v.name}</span>
                      {v.affiliation && (
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic' }}>{v.affiliation}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', ...( v.missingSma ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                      {v.missingSma ? '✗ missing' : '✓'}
                    </span>
                    <span style={{ fontSize: '0.75rem', ...( v.missingSchool ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                      {v.missingSchool ? '✗ missing' : '✓'}
                    </span>
                    <span style={{ fontSize: '0.75rem', ...( v.missingBirthday ? { color: '#ef4444', fontWeight: 600 } : { color: '#4ade80' }) }}>
                      {v.missingBirthday ? '✗ missing' : '✓'}
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