'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

function getMountainNow() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })
  return new Date(str)
}

function getMountainLabel() {
  const now = new Date()
  const mtnStr = now.toLocaleString('en-US', { timeZone: 'America/Denver' })
  const mtnDate = new Date(mtnStr)
  const mtnOffset = (now - mtnDate) / 60000
  return mtnOffset <= 360 ? 'MDT' : 'MST'
}

function asUTC(ts) {
  if (!ts) return null
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}

function formatTime(ts) {
  if (!ts) return '—'
  return asUTC(ts).toLocaleTimeString('en-US', {
    timeZone: 'America/Denver',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function minutesSince(ts) {
  if (!ts) return null
  return Math.floor((Date.now() - asUTC(ts).getTime()) / 60000)
}

export default function CSPage() {
  const router = useRouter()

  const [loading, setLoading]       = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [currentTime, setCurrentTime] = useState(getMountainNow())

  const [activeShifts, setActiveShifts] = useState([])
  const [schedule, setSchedule]         = useState([])
  const [volunteers, setVolunteers]     = useState([])
  const [callouts, setCallouts]         = useState([])

  const [tab, setTab]             = useState('live')
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState(null)

  useEffect(() => {
    checkAccess()
    const tick = setInterval(() => setCurrentTime(getMountainNow()), 60000)
    return () => clearInterval(tick)
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('default_role')
      .eq('id', user.id)
      .single()

    if (profile?.default_role !== 'Information Systems') {
      router.push('/volunteer')
      return
    }

    setAuthorized(true)
    await loadData()
    setLoading(false)
  }

  async function loadData() {
    const todayMtn = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })

    const [shiftsRes, schedRes, volsRes, calloutsRes] = await Promise.all([
      supabase.from('shifts').select('*').is('clock_out', null),
      supabase.from('schedule').select('*'),
      supabase.from('profiles').select('id, full_name, phone, languages, role, default_role, affiliation, email'),
      supabase.from('callouts')
        .select('*')
        .eq('callout_date', todayMtn)
        .eq('status', 'approved'),
    ])

    setActiveShifts(shiftsRes.data || [])
    setSchedule(schedRes.data || [])
    setVolunteers(volsRes.data || [])
    setCallouts(calloutsRes.data || [])
  }

  // ── Derived state ─────────────────────────────────────────

  const mtnNow    = getMountainNow()
  const dayIndex  = mtnNow.getDay()
  const isWeekday = dayIndex >= 1 && dayIndex <= 5
  const h         = mtnNow.getHours() + mtnNow.getMinutes() / 60
  const currentShift  = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
  const currentDay    = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
  const todayMtn      = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })

  function getVol(id) { return volunteers.find(v => v.id === id) }

  const clockedInIds = new Set(
    activeShifts.map(s => s.volunteer_id)
  )

  // ALL people currently clocked in (NO schedule filtering)
  const clockedInNow = activeShifts.map(s => ({
    ...s,
    volunteer: getVol(s.volunteer_id)
  }))

  // ALL scheduled people (NO time/day filtering here)
  const scheduled = schedule.map(s => ({
    ...s,
    volunteer: getVol(s.volunteer_id)
  }))

  // scheduled but NOT clocked in
  const scheduledNotClockedIn = scheduled.filter(
    s => !clockedInIds.has(s.volunteer_id)
  )
  const excusedIds    = new Set(callouts.map(c => c.volunteer_id))

  // Schedule entries for current shift (or all if not shift time)
  function getScheduledForShift(day, shift) {
    return schedule.filter(s =>
      s.day_of_week === day &&
      s.shift_time  === shift
    )
  }

  const currentScheduled = (isWeekday && currentShift)
    ? getScheduledForShift(currentDay, currentShift)
    : []

  const presentEntries    = currentScheduled.filter(s => clockedInIds.has(s.volunteer_id))
  const excusedEntries    = currentScheduled.filter(s => excusedIds.has(s.volunteer_id) && !clockedInIds.has(s.volunteer_id))
  const missingEntries    = currentScheduled.filter(s => !clockedInIds.has(s.volunteer_id) && !excusedIds.has(s.volunteer_id))

  // Language coverage: for each shift combo, collect all languages spoken
  function getLanguageCoverage() {
    const combos = {}
    const days  = ['monday','tuesday','wednesday','thursday','friday']
    const shifts = ['10-2','2-6']
    days.forEach(day => {
      shifts.forEach(shift => {
        const entries = getScheduledForShift(day, shift)
        const langs = new Set()
        entries.forEach(e => {
          const vol = getVol(e.volunteer_id)
          if (vol?.languages) {
            vol.languages.split(',').map(l => l.trim()).filter(Boolean).forEach(l => langs.add(l))
          }
        })
        if (!combos[day]) combos[day] = {}
        combos[day][shift] = [...langs]
      })
    })
    return combos
  }

  const languageCoverage = getLanguageCoverage()
  const dayLabels = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' }

  // Contact search
  const filteredContacts = volunteers.filter(v => {
    const q = contactSearch.toLowerCase()
    return !q ||
      v.full_name?.toLowerCase().includes(q) ||
      v.phone?.toLowerCase().includes(q) ||
      v.languages?.toLowerCase().includes(q)
  })

  // ── Styles ────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  if (!authorized) return null

  const card       = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.65rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  const statusBadge = (status) => {
    const map = {
      present:    { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', border: 'rgba(74,222,128,0.3)'  },
      excused:    { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', border: 'rgba(96,165,250,0.3)'  },
      missing:    { bg: 'rgba(239,68,68,0.10)',   color: '#ef4444', border: 'rgba(239,68,68,0.25)'  },
    }
    const s = map[status] || map.missing
    return {
      fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.55rem',
      borderRadius: '100px', background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
    }
  }

  const tzLabel = getMountainLabel()

  // Volunteer row for the roster views
  function VolRow({ entry, status }) {
    const vol = getVol(entry.volunteer_id)
    const shift = activeShifts.find(s => s.volunteer_id === entry.volunteer_id)
    const mins = shift ? minutesSince(shift.clock_in) : null

    return (
      <div
        onClick={() => setSelectedContact(selectedContact?.id === entry.volunteer_id ? null : vol)}
        style={{
          padding: '0.75rem 1rem',
          background: 'var(--bg)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%', background: 'var(--surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.9rem',
              color: status === 'present' ? 'var(--accent)' : status === 'excused' ? '#60a5fa' : '#ef4444',
            }}>
              {vol?.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>{vol?.full_name || 'Unknown'}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: 0 }}>{entry.role}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {status === 'present' && shift && (
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>
                in {formatTime(shift.clock_in)}
                {mins !== null && mins > 0 && (
                  <span style={{ marginLeft: '0.35rem', color: mins > 20 ? '#02416b' : 'var(--muted)' }}>
                    ({mins}m ago)
                  </span>
                )}
              </span>
            )}
            <span style={statusBadge(status)}>
              {status === 'present' ? 'Present' : status === 'excused' ? 'Excused' : 'Not In'}
            </span>
          </div>
        </div>

        {/* Expanded contact info */}
        {selectedContact?.id === entry.volunteer_id && vol && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <p style={labelStyle}>Phone</p>
              <p style={{ fontSize: '0.88rem', fontFamily: 'DM Mono, monospace', color: vol.phone ? 'var(--text)' : 'var(--muted)', fontStyle: vol.phone ? 'normal' : 'italic' }}>
                {vol.phone || 'Not set'}
              </p>
            </div>
            {vol.languages && (
              <div>
                <p style={labelStyle}>Languages</p>
                <p style={{ fontSize: '0.88rem', color: 'var(--text)' }}>{vol.languages}</p>
              </div>
            )}
            {vol.affiliation && (
              <div>
                <p style={labelStyle}>Affiliation</p>
                <p style={{ fontSize: '0.88rem', color: 'var(--text)', textTransform: 'capitalize' }}>{vol.affiliation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
              Clinical Supervisor
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {currentTime.toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'long', month: 'long', day: 'numeric' })}
              &nbsp;·&nbsp;
              <span style={{ fontFamily: 'DM Mono, monospace' }}>
                {currentTime.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })} {tzLabel}
              </span>
            </p>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Sign out
          </button>
        </div>

        {/* Stat pills */}
        {isWeekday && currentShift && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Present', value: presentEntries.length, color: 'var(--accent)', borderColor: 'rgba(74,222,128,0.35)' },
              { label: 'Excused', value: excusedEntries.length, color: '#60a5fa', borderColor: 'rgba(96,165,250,0.35)' },
              { label: 'Not In', value: missingEntries.length, color: missingEntries.length > 0 ? '#ef4444' : 'var(--muted)', borderColor: missingEntries.length > 0 ? 'rgba(239,68,68,0.35)' : 'var(--border)' },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: 'center', padding: '1rem', borderColor: s.borderColor }}>
                <p style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.color, lineHeight: 1 }}>{s.value}</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: '0.3rem' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            ['live',      'Live Roster'],
            ['schedule',  'Full Schedule'],
            ['contacts',  'Contacts'],
            ['languages', 'Language Coverage'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSelectedContact(null) }}
              style={{
                padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                background: tab === key ? 'var(--accent)' : 'var(--surface)',
                color:      tab === key ? '#fff' : 'var(--muted)',
                border:     tab === key ? 'none' : '1px solid var(--border)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── LIVE ROSTER ─────────────────────────────────── */}
        {tab === 'live' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {!isWeekday || !currentShift ? (
              <div style={card}>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  No active shift window right now. Shifts run Mon–Fri, 10–2 and 2–6 (Mountain Time).
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '-0.25rem' }}>
                  Live view · Tap a name to see contact info
                </p>

                {/* ───────────────────────────── */}
               {/* CLOCKED IN (ALL ACTIVE SHIFTS) */}
                {/* ───────────────────────────── */}
                {clockedInNow.length > 0 && (
                  <div style={card}>
                    <h2 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.85rem' }}>
                      Clocked In · {clockedInNow.length}
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {clockedInNow.map(e => (
                        <VolRow
                          key={e.id}
                          entry={e}
                          status="present"
                        />
                      ))}
                    </div>
                  </div>
                )}
        
                {/* ───────────────────────────── */}
                {/* SCHEDULED BUT NOT CLOCKED IN */}
                {/* ───────────────────────────── */}
                {scheduledNotClockedIn.length > 0 && (
                  <div style={{ ...card, borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.03)' }}>
                    <h2 style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      marginBottom: '0.85rem',
                      color: '#ef4444'
                    }}>
                      Not Clocked In · {scheduledNotClockedIn.length}
                    </h2>
        
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {scheduledNotClockedIn.map(e => (
                        <VolRow
                          key={e.id}
                          entry={e}
                          status="missing"
                        />
                      ))}
                    </div>
                  </div>
                )}
        
                {/* ───────────────────────────── */}
                {/* EXCUSED (UNCHANGED) */}
                {/* ───────────────────────────── */}
                {excusedEntries.length > 0 && (
                  <div style={card}>
                    <h2 style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      marginBottom: '0.85rem',
                      color: '#60a5fa'
                    }}>
                      Called Out (Excused) · {excusedEntries.length}
                    </h2>
        
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {excusedEntries.map(e => (
                        <VolRow
                          key={e.id}
                          entry={e}
                          status="excused"
                        />
                      ))}
                    </div>
                  </div>
                )}
        
                {/* ───────────────────────────── */}
                {/* EMPTY STATE */}
                {/* ───────────────────────────── */}
                {clockedInNow.length === 0 && scheduledNotClockedIn.length === 0 && (
                  <div style={card}>
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                      No active volunteers in this shift window.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── FULL SCHEDULE ────────────────────────────────── */}
        {tab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Full weekly schedule · Tap a name to expand contact info
            </p>
            {['monday','tuesday','wednesday','thursday','friday'].map(day => (
              ['10-2','2-6'].map(shift => {
                const entries = getScheduledForShift(day, shift)
                if (entries.length === 0) return null
                return (
                  <div key={`${day}-${shift}`} style={card}>
                    <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{day}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--bg)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}>{shift}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 400 }}>{entries.length} scheduled</span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {entries.map(e => {
                        const vol = getVol(e.volunteer_id)
                        const isExpanded = selectedContact?.id === e.volunteer_id
                        return (
                          <div
                            key={e.id}
                            onClick={() => setSelectedContact(isExpanded ? null : vol)}
                            style={{ padding: '0.6rem 0.85rem', background: 'var(--bg)', borderRadius: '7px', border: '1px solid var(--border)', cursor: 'pointer' }}
                            onMouseEnter={ev => ev.currentTarget.style.borderColor = 'var(--accent)'}
                            onMouseLeave={ev => ev.currentTarget.style.borderColor = 'var(--border)'}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{vol?.full_name || 'Unknown'}</span>
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{e.role}</span>
                              </div>
                              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{isExpanded ? '▲' : '▾'}</span>
                            </div>
                            {isExpanded && vol && (
                              <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                                <div>
                                  <p style={labelStyle}>Phone</p>
                                  <p style={{ fontSize: '0.85rem', fontFamily: 'DM Mono, monospace', color: vol.phone ? 'var(--text)' : 'var(--muted)', fontStyle: vol.phone ? 'normal' : 'italic' }}>{vol.phone || 'Not set'}</p>
                                </div>
                                {vol.languages && (
                                  <div>
                                    <p style={labelStyle}>Languages</p>
                                    <p style={{ fontSize: '0.85rem' }}>{vol.languages}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            ))}
          </div>
        )}

        {/* ── CONTACTS ─────────────────────────────────────── */}
        {tab === 'contacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={card}>
              <input
                type="text"
                placeholder="Search by name, phone, or language…"
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {filteredContacts.length === 0 && (
                <div style={card}><p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No volunteers found.</p></div>
              )}
              {filteredContacts.map(vol => (
                <div key={vol.id} style={{ ...card, padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent)', flexShrink: 0 }}>
                        {vol.full_name?.charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>{vol.full_name}</p>
                        {vol.default_role && <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: 0 }}>{vol.default_role}</p>}
                      </div>
                    </div>
                    {clockedInIds.has(vol.id) && (
                      <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>
                        Clocked in
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '0.85rem' }}>
                    <div>
                      <p style={labelStyle}>Phone</p>
                      <p style={{ fontSize: '0.85rem', fontFamily: 'DM Mono, monospace', color: vol.phone ? 'var(--text)' : 'var(--muted)', fontStyle: vol.phone ? 'normal' : 'italic', margin: 0 }}>
                        {vol.phone || 'Not set'}
                      </p>
                    </div>
                    {vol.languages && (
                      <div>
                        <p style={labelStyle}>Languages</p>
                        <p style={{ fontSize: '0.85rem', margin: 0 }}>{vol.languages}</p>
                      </div>
                    )}
                    {vol.affiliation && (
                      <div>
                        <p style={labelStyle}>Affiliation</p>
                        <p style={{ fontSize: '0.85rem', margin: 0, textTransform: 'capitalize' }}>{vol.affiliation}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LANGUAGE COVERAGE ────────────────────────────── */}
        {tab === 'languages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Languages available per shift, based on scheduled volunteers' profiles.
            </p>

            {/* Current shift highlight */}
            {isWeekday && currentShift && (
              <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)' }}>
                <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                  Current Shift Coverage
                  <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>{currentDay} {currentShift}</span>
                </h2>
                {(() => {
                  const langs = languageCoverage[currentDay]?.[currentShift] || []
                  // Also count which clocked-in volunteers speak each language
                  const presentLangs = {}
                  presentEntries.forEach(e => {
                    const vol = getVol(e.volunteer_id)
                    vol?.languages?.split(',').map(l => l.trim()).filter(Boolean).forEach(l => {
                      if (!presentLangs[l]) presentLangs[l] = 0
                      presentLangs[l]++
                    })
                  })
                  if (langs.length === 0) return <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No language data for this shift.</p>
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {langs.map(lang => {
                        const presentCount = presentLangs[lang] || 0
                        return (
                          <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.85rem', borderRadius: '100px', background: presentCount > 0 ? 'rgba(74,222,128,0.12)' : 'rgba(156,163,175,0.12)', border: `1px solid ${presentCount > 0 ? 'rgba(74,222,128,0.3)' : 'rgba(156,163,175,0.3)'}`, fontSize: '0.85rem', fontWeight: 500, color: presentCount > 0 ? '#4ade80' : 'var(--muted)' }}>
                            {lang}
                            <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({presentCount} in)</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Full week grid */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Weekly Language Map</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', color: 'var(--muted)', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Day</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', color: 'var(--muted)', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>10–2</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', color: 'var(--muted)', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>2–6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['monday','tuesday','wednesday','thursday','friday'].map((day, i) => (
                      <tr key={day} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text)', fontWeight: 500, textTransform: 'capitalize', borderBottom: '1px solid var(--border)' }}>
                          {dayLabels[day]}
                        </td>
                        {['10-2','2-6'].map(shift => {
                          const langs = languageCoverage[day]?.[shift] || []
                          const isCurrentCell = isWeekday && currentDay === day && currentShift === shift
                          return (
                            <td key={shift} style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)', background: isCurrentCell ? 'rgba(2,65,107,0.08)' : 'transparent' }}>
                              {langs.length === 0 ? (
                                <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                  {langs.map(l => (
                                    <span key={l} style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontWeight: 500 }}>
                                      {l}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Volunteers with languages */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.85rem' }}>Multilingual Volunteers</h2>
              {volunteers.filter(v => v.languages).length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No language data recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {volunteers.filter(v => v.languages).map(vol => (
                    <div key={vol.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.85rem', background: 'var(--bg)', borderRadius: '7px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{vol.full_name}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {vol.languages.split(',').map(l => l.trim()).filter(Boolean).map(l => (
                          <span key={l} style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontWeight: 500 }}>
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}