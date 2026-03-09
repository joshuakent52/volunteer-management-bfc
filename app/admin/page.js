'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export const dynamic = 'force-dynamic'

const DAYS = ['monday','tuesday','wednesday','thursday','friday']
const SHIFTS = ['10-2','2-6']
const ROLES = [
  'Clinical Staff','Scribe','Receptionist','Lab','Pharmacy',
  'Clinical Supervisor','Patient Nav.','Mental Health','Support Center',
  'Young Support','Float','OSSM','Information Systems',
  'Credentialing','Media','Provider'
]

function getMountainOffset(date) {
  const year = date.getUTCFullYear()
  const march = new Date(Date.UTC(year, 2, 1))
  const marchDay = march.getUTCDay()
  const dstStart = new Date(Date.UTC(year, 2, (marchDay === 0 ? 8 : 8 + (7 - marchDay))))
  const nov = new Date(Date.UTC(year, 10, 1))
  const novDay = nov.getUTCDay()
  const dstEnd = new Date(Date.UTC(year, 10, (novDay === 0 ? 1 : 1 + (7 - novDay))))
  return (date >= dstStart && date < dstEnd) ? -6 : -7
}

function getMountainNow() {
  const now = new Date()
  const offsetHours = getMountainOffset(now)
  return new Date(now.getTime() + (now.getTimezoneOffset() + offsetHours * 60) * 60000)
}

function getMountainLabel() {
  return getMountainOffset(new Date()) === -6 ? 'MDT' : 'MST'
}

function getCurrentDayAndShift() {
  const now = getMountainNow()
  const dayIndex = now.getDay()
  if (dayIndex === 0 || dayIndex === 6) return { day: null, shift: null, isShiftTime: false }

  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
  const hour = now.getHours()
  const minute = now.getMinutes()
  const timeDecimal = hour + minute / 60

  let shift = null
  if (timeDecimal >= 10 && timeDecimal < 14) shift = '10-2'
  else if (timeDecimal >= 14 && timeDecimal < 18) shift = '2-6'

  return { day: dayName, shift, isShiftTime: !!shift }
}

function formatMountain(ts) {
  if (!ts) return '—'
  const date = new Date(ts)
  const offsetHours = getMountainOffset(date)
  const adjusted = new Date(date.getTime() + (date.getTimezoneOffset() + offsetHours * 60) * 60000)
  return adjusted.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDateMountain(ts) {
  if (!ts) return '—'
  const date = new Date(ts)
  const offsetHours = getMountainOffset(date)
  const adjusted = new Date(date.getTime() + (date.getTimezoneOffset() + offsetHours * 60) * 60000)
  return adjusted.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminPage() {
  const [profile, setProfile] = useState(null)
  const [volunteers, setVolunteers] = useState([])
  const [activeShifts, setActiveShifts] = useState([])
  const [callouts, setCallouts] = useState([])
  const [schedule, setSchedule] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [currentTime, setCurrentTime] = useState(getMountainNow())
  const [showReadCallouts, setShowReadCallouts] = useState(false)

  // Schedule UI
  const [scheduleDay, setScheduleDay] = useState('monday')
  const [scheduleShift, setScheduleShift] = useState('10-2')
  const [addingRole, setAddingRole] = useState(null)
  const [addVolId, setAddVolId] = useState('')
  const [addingEntry, setAddingEntry] = useState(false)

  // Volunteer detail/edit
  const [selectedVolunteer, setSelectedVolunteer] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  // Create volunteer
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('volunteer')
  const [newAffiliation, setNewAffiliation] = useState('')
  const [newParking, setNewParking] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newLanguages, setNewLanguages] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    init()
    const interval = setInterval(() => setCurrentTime(getMountainNow()), 60000)
    return () => clearInterval(interval)
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/'; return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (p?.role !== 'admin') { window.location.href = '/volunteer'; return }
    setProfile(p)
    await Promise.all([loadVolunteers(), loadActiveShifts(), loadCallouts(), loadSchedule()])
    setLoading(false)
  }

  async function loadVolunteers() {
    const { data } = await supabase.from('profiles').select('*, shifts(*)').order('full_name')
    setVolunteers(data || [])
  }

  async function loadActiveShifts() {
    const { data } = await supabase.from('shifts').select('*, profiles(id, full_name)').is('clock_out', null)
    setActiveShifts(data || [])
  }

  async function loadCallouts() {
    const { data } = await supabase.from('callouts').select('*, profiles(full_name)').order('submitted_at', { ascending: false }).limit(50)
    setCallouts(data || [])
  }

  async function loadSchedule() {
    const { data } = await supabase.from('schedule').select('*, profiles(id, full_name)').order('role')
    setSchedule(data || [])
  }

  async function markCalloutRead(id, isRead) {
    const { error } = await supabase.from('callouts').update({ is_read: isRead }).eq('id', id)
    if (error) showMessage(error.message, 'error')
    else await loadCallouts()
  }

  function getMissingVolunteers() {
    const { day, shift, isShiftTime } = getCurrentDayAndShift()
    if (!isShiftTime) return { missing: [], day, shift, isShiftTime: false }

    const calledOutIds = new Set(
      callouts.filter(c => c.day_of_week === day && c.shift_time === shift).map(c => c.volunteer_id)
    )
    const scheduledEntries = schedule.filter(s => s.day_of_week === day && s.shift_time === shift)
    const scheduledIds = [...new Set(scheduledEntries.map(s => s.volunteer_id))]
    const clockedInIds = new Set(activeShifts.map(s => s.profiles?.id).filter(Boolean))

    const missing = scheduledIds
      .filter(id => !calledOutIds.has(id) && !clockedInIds.has(id))
      .map(id => {
        const entry = scheduledEntries.find(s => s.volunteer_id === id)
        return { id, name: entry?.profiles?.full_name, role: entry?.role }
      })
      .filter(v => v.name)

    return { missing, day, shift, isShiftTime: true }
  }

  function getEntries(day, shift, role) {
    return schedule.filter(s => s.day_of_week === day && s.shift_time === shift && s.role === role)
  }

  function hasCallout(volunteerId, day, shift) {
    return callouts.some(c => c.volunteer_id === volunteerId && c.day_of_week === day && c.shift_time === shift)
  }

  async function handleAddEntry() {
    if (!addVolId) return
    setAddingEntry(true)
    const exists = schedule.find(s =>
      s.volunteer_id === addVolId && s.day_of_week === scheduleDay &&
      s.shift_time === scheduleShift && s.role === addingRole
    )
    if (exists) { showMessage('Volunteer already assigned to this slot', 'error'); setAddingEntry(false); return }
    const { error } = await supabase.from('schedule').insert({
      volunteer_id: addVolId, day_of_week: scheduleDay, shift_time: scheduleShift, role: addingRole,
    })
    if (error) showMessage(error.message, 'error')
    else { showMessage('Volunteer assigned!', 'success'); setAddingRole(null); setAddVolId(''); await loadSchedule() }
    setAddingEntry(false)
  }

  async function handleRemoveEntry(id) {
    const { error } = await supabase.from('schedule').delete().eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Removed from schedule', 'success'); await loadSchedule() }
  }

  function openVolunteer(v) {
    setSelectedVolunteer(v)
    setEditForm({
      full_name: v.full_name||'', email: v.email||'', phone: v.phone||'',
      affiliation: v.affiliation||'', parking_pass: v.parking_pass||'',
      languages: v.languages||'', role: v.role||'volunteer',
    })
    setEditing(false)
  }

  async function handleSaveEdit() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name, phone: editForm.phone,
      affiliation: editForm.affiliation || null,
      parking_pass: editForm.parking_pass ? parseInt(editForm.parking_pass) : null,
      languages: editForm.languages, role: editForm.role,
    }).eq('id', selectedVolunteer.id)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Profile updated!', 'success')
      setEditing(false)
      await loadVolunteers()
      setSelectedVolunteer(prev => ({ ...prev, ...editForm }))
    }
    setSaving(false)
  }

  async function handleCreateVolunteer(e) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await supabase.auth.signUp({ email: newEmail, password: newPassword })
    if (error) { showMessage(error.message, 'error'); setCreating(false); return }
    const { error: pe } = await supabase.from('profiles').insert({
      id: data.user.id, full_name: newName, email: newEmail, role: newRole,
      affiliation: newAffiliation||null, parking_pass: newParking ? parseInt(newParking) : null,
      phone: newPhone||null, languages: newLanguages||null,
    })
    if (pe) showMessage(pe.message, 'error')
    else {
      showMessage(`Account created for ${newName}!`, 'success')
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('volunteer')
      setNewAffiliation(''); setNewParking(''); setNewPhone(''); setNewLanguages('')
      loadVolunteers()
    }
    setCreating(false)
  }

  function totalHours(shifts) {
    return shifts?.reduce((acc, s) => {
      if (!s.clock_out) return acc
      return acc + (new Date(s.clock_out) - new Date(s.clock_in)) / 1000 / 60 / 60
    }, 0).toFixed(1) || '0.0'
  }

  function showMessage(text, type) {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3500)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const affiliationColor = { missionary: '#a78bfa', student: '#60a5fa', volunteer: '#4ade80', provider: '#fbbf24' }
  const badgeStyle = (color) => ({ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500, background: color + '22', color: color, border: `1px solid ${color}55` })

  const { missing, day: currentDay, shift: currentShift, isShiftTime } = getMissingVolunteers()
  const unreadCallouts = callouts.filter(c => !c.is_read)
  const readCallouts = callouts.filter(c => c.is_read)
  const tzLabel = getMountainLabel()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>🛠 Admin Dashboard</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Bingham Family Clinic &nbsp;·&nbsp;
              <span style={{ fontFamily: 'DM Mono, monospace' }}>
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} {tzLabel}
              </span>
            </p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            Sign out
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Volunteers', value: volunteers.filter(v => v.role === 'volunteer').length },
            { label: 'Clocked In Now', value: activeShifts.length, accent: true },
            { label: 'Unread Call-Outs', value: unreadCallouts.length, warn: unreadCallouts.length > 0 },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', borderColor: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : 'var(--border)' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : 'var(--text)' }}>{s.value}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[['dashboard','📊 Live'],['schedule','📅 Schedule'],['volunteers','👥 Volunteers'],['callouts','📋 Call-Outs'],['create','➕ Add Volunteer']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setSelectedVolunteer(null); setAddingRole(null) }} style={{
              padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              background: tab === key ? 'var(--accent)' : 'var(--surface)',
              color: tab === key ? '#0a0f0a' : 'var(--muted)',
              border: tab === key ? 'none' : '1px solid var(--border)',
            }}>{label}</button>
          ))}
        </div>

        {/* LIVE TAB */}
        {tab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Missing volunteers */}
            {isShiftTime && (
              <div style={{ ...card, borderColor: missing.length > 0 ? 'var(--danger)' : 'var(--accent)', background: missing.length > 0 ? 'rgba(248,113,113,0.05)' : 'rgba(74,222,128,0.05)' }}>
                <h2 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: missing.length > 0 ? '1rem' : 0 }}>
                  {missing.length > 0
                    ? `⚠️ ${missing.length} volunteer${missing.length > 1 ? 's' : ''} not yet clocked in — ${currentDay} ${currentShift}`
                    : `✅ All volunteers present — ${currentDay} ${currentShift}`
                  }
                </h2>
                {missing.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {missing.map(v => (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: 'rgba(248,113,113,0.08)', borderRadius: '8px', border: '1px solid rgba(248,113,113,0.3)' }}>
                        <span style={{ fontWeight: 500 }}>{v.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{v.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isShiftTime && (
              <div style={{ ...card }}>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  ℹ️ No active shift window right now. Missing volunteer alerts appear during shift hours (Mon–Fri, 10:00–14:00 and 14:00–18:00 {tzLabel}).
                </p>
              </div>
            )}

            {/* Clocked in */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Currently Clocked In</h2>
              {activeShifts.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No one is currently clocked in.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {activeShifts.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(74,222,128,0.05)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                        <span style={{ fontWeight: 500 }}>{s.profiles?.full_name}</span>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Since {formatMountain(s.clock_in)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => { setScheduleDay(d); setAddingRole(null) }} style={{
                    padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textTransform: 'capitalize',
                    background: scheduleDay === d ? 'var(--accent)' : 'var(--surface)',
                    color: scheduleDay === d ? '#0a0f0a' : 'var(--muted)',
                    border: scheduleDay === d ? 'none' : '1px solid var(--border)',
                  }}>{d.slice(0,3)}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {SHIFTS.map(sh => (
                  <button key={sh} onClick={() => { setScheduleShift(sh); setAddingRole(null) }} style={{
                    padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                    background: scheduleShift === sh ? '#1e40af' : 'var(--surface)',
                    color: scheduleShift === sh ? '#bfdbfe' : 'var(--muted)',
                    border: scheduleShift === sh ? 'none' : '1px solid var(--border)',
                  }}>{sh}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {ROLES.map(role => {
                const entries = getEntries(scheduleDay, scheduleShift, role)
                const isOpen = addingRole === role
                return (
                  <div key={role} style={{ ...card, padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: entries.length > 0 || isOpen ? '0.75rem' : 0 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{role}</span>
                      <button onClick={() => { setAddingRole(isOpen ? null : role); setAddVolId('') }} style={{
                        padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        background: isOpen ? 'var(--surface)' : 'rgba(74,222,128,0.15)',
                        color: isOpen ? 'var(--muted)' : 'var(--accent)',
                        border: `1px solid ${isOpen ? 'var(--border)' : 'var(--accent)'}`,
                      }}>{isOpen ? 'Cancel' : '+ Assign'}</button>
                    </div>
                    {entries.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: isOpen ? '0.75rem' : 0 }}>
                        {entries.map(entry => {
                          const calledOut = hasCallout(entry.volunteer_id, scheduleDay, scheduleShift)
                          return (
                            <div key={entry.id} style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.3rem 0.6rem 0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.85rem',
                              background: calledOut ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.08)',
                              border: `1px solid ${calledOut ? 'var(--warn)' : 'var(--accent)'}55`,
                              color: calledOut ? 'var(--warn)' : 'var(--text)',
                            }}>
                              {calledOut && <span>⚠️</span>}
                              <span>{entry.profiles?.full_name}</span>
                              <button onClick={() => handleRemoveEntry(entry.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}>✕</button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {isOpen && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select value={addVolId} onChange={e => setAddVolId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                          <option value="">— Select volunteer —</option>
                          {volunteers.filter(v => v.role === 'volunteer').map(v => (
                            <option key={v.id} value={v.id}>{v.full_name}</option>
                          ))}
                        </select>
                        <button onClick={handleAddEntry} disabled={!addVolId || addingEntry} style={{
                          padding: '0.75rem 1.25rem', background: 'var(--accent)', color: '#0a0f0a',
                          border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
                        }}>{addingEntry ? '...' : 'Assign'}</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* VOLUNTEERS TAB */}
        {tab === 'volunteers' && !selectedVolunteer && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>All Volunteers <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— click to view or edit</span></h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {volunteers.filter(v => v.role === 'volunteer').map(v => (
                <div key={v.id} onClick={() => openVolunteer(v)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--accent)' }}>
                      {v.full_name?.charAt(0)}
                    </div>
                    <div>
                      <p style={{ fontWeight: 500 }}>{v.full_name}</p>
                      <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{v.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {v.affiliation && <span style={badgeStyle(affiliationColor[v.affiliation] || '#9ca3af')}>{v.affiliation}</span>}
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: 'var(--accent)' }}>{totalHours(v.shifts)}h</span>
                    <span style={{ color: 'var(--muted)' }}>›</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VOLUNTEER DETAIL */}
        {tab === 'volunteers' && selectedVolunteer && (
          <div style={card}>
            <button onClick={() => setSelectedVolunteer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '1.25rem', padding: 0, fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3rem', color: 'var(--accent)', border: '2px solid var(--accent)' }}>
                  {selectedVolunteer.full_name?.charAt(0)}
                </div>
                <div>
                  <h2 style={{ fontWeight: 600, fontSize: '1.2rem' }}>{selectedVolunteer.full_name}</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{selectedVolunteer.email}</p>
                </div>
              </div>
              <button onClick={() => setEditing(!editing)} style={{
                padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                background: editing ? 'var(--surface)' : 'var(--accent)',
                color: editing ? 'var(--muted)' : '#0a0f0a',
                border: editing ? '1px solid var(--border)' : 'none',
              }}>{editing ? 'Cancel' : '✏️ Edit'}</button>
            </div>
            {!editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { label: 'Phone', value: selectedVolunteer.phone },
                  { label: 'Affiliation', value: selectedVolunteer.affiliation },
                  { label: 'Parking Pass', value: selectedVolunteer.parking_pass },
                  { label: 'Languages', value: selectedVolunteer.languages },
                  { label: 'Total Hours', value: totalHours(selectedVolunteer.shifts) + 'h' },
                  { label: 'Role', value: selectedVolunteer.role },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{label}</p>
                    <p style={{ fontWeight: 500, color: value ? 'var(--text)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label style={labelStyle}>Full Name</label><input value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Phone</label><input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} placeholder="xxx-xxx-xxxx" style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>Affiliation</label>
                    <select value={editForm.affiliation} onChange={e => setEditForm({...editForm, affiliation: e.target.value})} style={inputStyle}>
                      <option value="">— Select —</option>
                      <option value="missionary">Missionary</option>
                      <option value="student">Student</option>
                      <option value="volunteer">Volunteer</option>
                      <option value="provider">Provider</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>Parking Pass (1–100)</label><input type="number" min="1" max="100" value={editForm.parking_pass} onChange={e => setEditForm({...editForm, parking_pass: e.target.value})} style={inputStyle} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Languages</label><input value={editForm.languages} onChange={e => setEditForm({...editForm, languages: e.target.value})} placeholder="e.g. Spanish, French" style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} style={inputStyle}>
                      <option value="volunteer">Volunteer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <button onClick={handleSaveEdit} disabled={saving} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* CALLOUTS TAB */}
        {tab === 'callouts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>
                Unread Call-Outs
                {unreadCallouts.length > 0 && (
                  <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.55rem', background: 'rgba(251,191,36,0.15)', color: 'var(--warn)', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(251,191,36,0.3)' }}>
                    {unreadCallouts.length}
                  </span>
                )}
              </h2>
              {unreadCallouts.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No unread call-outs. You're all caught up!</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {unreadCallouts.map(c => (
                    <div key={c.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: c.reason ? '0.25rem' : 0 }}>
                        <div>
                          <span style={{ fontWeight: 500 }}>{c.profiles?.full_name}</span>
                          {c.shift_time && (
                            <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'capitalize' }}>
                              {c.day_of_week} {c.shift_time}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ color: 'var(--warn)', fontFamily: 'DM Mono, monospace', fontSize: '0.85rem' }}>
                            {formatDateMountain(c.callout_date)}
                          </span>
                          <button onClick={() => markCalloutRead(c.id, true)} style={{ padding: '0.25rem 0.65rem', background: 'rgba(74,222,128,0.1)', color: 'var(--accent)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
                            ✓ Mark read
                          </button>
                        </div>
                      </div>
                      {c.reason && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{c.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {readCallouts.length > 0 && (
              <div style={card}>
                <button onClick={() => setShowReadCallouts(!showReadCallouts)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.9rem', fontWeight: 500, padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', transform: showReadCallouts ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>›</span>
                  Read Call-Outs ({readCallouts.length})
                </button>
                {showReadCallouts && (
                  <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {readCallouts.map(c => (
                      <div key={c.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', opacity: 0.6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: c.reason ? '0.25rem' : 0 }}>
                          <div>
                            <span style={{ fontWeight: 500 }}>{c.profiles?.full_name}</span>
                            {c.shift_time && (
                              <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'capitalize' }}>
                                {c.day_of_week} {c.shift_time}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ color: 'var(--muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.85rem' }}>
                              {formatDateMountain(c.callout_date)}
                            </span>
                            <button onClick={() => markCalloutRead(c.id, false)} style={{ padding: '0.25rem 0.65rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
                              ↩ Unmark
                            </button>
                          </div>
                        </div>
                        {c.reason && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{c.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CREATE TAB */}
        {tab === 'create' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Create Volunteer Account</h2>
            <form onSubmit={handleCreateVolunteer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div><label style={labelStyle}>Full Name</label><input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Jane Smith" style={inputStyle} /></div>
                <div><label style={labelStyle}>Email</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="jane@example.com" style={inputStyle} /></div>
                <div><label style={labelStyle}>Temporary Password</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Min 6 characters" style={inputStyle} /></div>
                <div><label style={labelStyle}>Phone</label><input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="xxx-xxx-xxxx" style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>Affiliation</label>
                  <select value={newAffiliation} onChange={e => setNewAffiliation(e.target.value)} style={inputStyle}>
                    <option value="">— Select —</option>
                    <option value="missionary">Missionary</option>
                    <option value="student">Student</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="provider">Provider</option>
                  </select>
                </div>
                <div><label style={labelStyle}>Parking Pass (1–100)</label><input type="number" min="1" max="100" value={newParking} onChange={e => setNewParking(e.target.value)} placeholder="e.g. 42" style={inputStyle} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Languages Spoken</label><input value={newLanguages} onChange={e => setNewLanguages(e.target.value)} placeholder="e.g. Spanish, Mandarin" style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} style={inputStyle}>
                    <option value="volunteer">Volunteer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={creating} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {creating ? 'Creating...' : 'Create Account'}
              </button>
            </form>
          </div>
        )}

        {/* Toast */}
        {message && (
          <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: message.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: message.type === 'success' ? '#0a0f0a' : '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}