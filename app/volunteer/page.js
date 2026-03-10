'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export const dynamic = 'force-dynamic'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
const SHIFTS = ['10-2','2-6']

export default function VolunteerPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeShift, setActiveShift] = useState(null)
  const [shifts, setShifts] = useState([])
  const [schedule, setSchedule] = useState([])
  const [calloutDate, setCalloutDate] = useState('')
  const [calloutShift, setCalloutShift] = useState('')
  const [calloutReason, setCalloutReason] = useState('')
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [clockLoading, setClockLoading] = useState(false)
  const [tab, setTab] = useState('clock')

  // Messaging state
  const [messages, setMessages] = useState([])
  const [msgBody, setMsgBody] = useState('')
  const [msgRecipientType, setMsgRecipientType] = useState('admin')
  const [msgSelectedShift, setMsgSelectedShift] = useState(null)  // { day, shift_time }
  const [msgSelectedRole, setMsgSelectedRole] = useState(null)
  const [sendingMsg, setSendingMsg] = useState(false)
  const [msgView, setMsgView] = useState('inbox')

  // Account / password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // All shifts for total hours (no limit)
  const [allShifts, setAllShifts] = useState([])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/'; return }
    setUser(user)

    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    setProfile(profileData)

    const { data: open } = await supabase
      .from('shifts').select('*')
      .eq('volunteer_id', user.id)
      .is('clock_out', null)
      .single()
    setActiveShift(open || null)

    const { data: history } = await supabase
      .from('shifts').select('*')
      .eq('volunteer_id', user.id)
      .order('clock_in', { ascending: false })
      .limit(10)
    setShifts(history || [])

    // Load all completed shifts for total hours
    const { data: all } = await supabase
      .from('shifts').select('clock_in, clock_out')
      .eq('volunteer_id', user.id)
      .not('clock_out', 'is', null)
    setAllShifts(all || [])

    const { data: sched } = await supabase
      .from('schedule').select('*, profiles(full_name)')
      .eq('volunteer_id', user.id)
      .order('day_of_week')
    setSchedule(sched || [])

    const { data: msgs } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(50)
    setMessages(msgs || [])

    setLoading(false)
  }

  function getCurrentShiftWindow() {
    const now = new Date()
    const mtnStr = now.toLocaleString('en-US', { timeZone: 'America/Denver' })
    const mtn = new Date(mtnStr)
    const dayIndex = mtn.getDay()
    if (dayIndex === 0 || dayIndex === 6) return { day: null, shift: null }
    const day = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
    const h = mtn.getHours() + mtn.getMinutes() / 60
    const shift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
    return { day, shift }
  }

  async function handleClockIn() {
    setClockLoading(true)

    // Auto-match role from schedule
    let resolvedRole = null
    const { day, shift } = getCurrentShiftWindow()
    if (day && shift) {
      const matches = schedule.filter(s => s.day_of_week === day && s.shift_time === shift)
      if (matches.length === 1) {
        resolvedRole = matches[0].role
      } else if (matches.length > 1) {
        // Prefer the entry matching default_role
        const preferred = matches.find(s => s.role === profile?.default_role)
        resolvedRole = preferred ? preferred.role : matches[0].role
      }
    }
    // Fall back to profile default_role if schedule had no match
    if (!resolvedRole && profile?.default_role) resolvedRole = profile.default_role

    const { data, error } = await supabase
      .from('shifts')
      .insert({ volunteer_id: user.id, clock_in: new Date().toISOString(), role: resolvedRole })
      .select().single()
    if (error) showToast(error.message, 'error')
    else { setActiveShift(data); showToast('Clocked in successfully!', 'success') }
    setClockLoading(false)
  }

  async function handleClockOut() {
    setClockLoading(true)
    const { error } = await supabase
      .from('shifts')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', activeShift.id)
    if (error) showToast(error.message, 'error')
    else { setActiveShift(null); showToast('Clocked out. Great work!', 'success'); init() }
    setClockLoading(false)
  }

  async function handleCallout(e) {
    e.preventDefault()
    // Derive day_of_week from the selected date
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    const derivedDay = calloutDate ? dayNames[new Date(calloutDate + 'T12:00:00').getDay()] : null
    const { error } = await supabase.from('callouts').insert({
      volunteer_id: user.id,
      callout_date: calloutDate,
      day_of_week: derivedDay,
      shift_time: calloutShift || null,
      reason: calloutReason,
    })
    if (error) showToast(error.message, 'error')
    else {
      showToast('Call-out submitted!', 'success')
      setCalloutDate(''); setCalloutShift(''); setCalloutReason('')
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault()
    if (!msgBody.trim()) return
    setSendingMsg(true)

    const payload = {
      sender_id: user.id,
      recipient_type: msgRecipientType,
      body: msgBody.trim(),
      recipient_shift: msgRecipientType === 'shift' ? (msgSelectedShift?.shift_time || null) : null,
      recipient_day: msgRecipientType === 'shift' ? (msgSelectedShift?.day || null) : null,
      recipient_role: msgRecipientType === 'role' ? (msgSelectedRole || null) : null,
      recipient_volunteer_id: null,
    }

    const { error } = await supabase.from('messages').insert(payload)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Message sent!', 'success')
      setMsgBody('')
      setMsgRecipientType('admin')
      setMsgSelectedShift(null)
      setMsgSelectedRole(null)
      setMsgView('inbox')
      const { data: msgs } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(50)
      setMessages(msgs || [])
    }
    setSendingMsg(false)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return }
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters', 'error'); return }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) showToast(error.message, 'error')
    else {
      showToast('Password updated!', 'success')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    }
    setChangingPassword(false)
  }

  function showToast(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Ensure Supabase timestamps (which may lack 'Z') are always parsed as UTC
  function asUTC(ts) {
    if (!ts) return null
    return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
  }

  function formatTime(ts) {
    if (!ts) return '—'
    return asUTC(ts).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return asUTC(ts).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })
  }

  function formatDateTime(ts) {
    if (!ts) return '—'
    return asUTC(ts).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function calcHours(clock_in, clock_out) {
    if (!clock_out) return 'Active'
    return ((asUTC(clock_out) - asUTC(clock_in)) / 3600000).toFixed(1) + 'h'
  }

  function totalHours() {
    return allShifts.reduce((acc, s) => {
      return acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000
    }, 0).toFixed(1)
  }

  function recipientLabel(msg) {
    if (msg.recipient_type === 'everyone') return 'Everyone'
    if (msg.recipient_type === 'admin') return 'Admin'
    if (msg.recipient_type === 'volunteer') return 'You'
    if (msg.recipient_type === 'shift') return `${msg.recipient_day ? msg.recipient_day.slice(0,3) + ' ' : ''}${msg.recipient_shift}`
    if (msg.recipient_type === 'role') return `${msg.recipient_role}`
    return msg.recipient_type
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  const inboxMessages = messages.filter(m => m.sender_id !== user?.id)
  const sentMessages = messages.filter(m => m.sender_id === user?.id)

  // Unique day+shift combos the volunteer is scheduled for
  const myShiftCombos = schedule.reduce((acc, s) => {
    const key = `${s.day_of_week}|${s.shift_time}`
    if (!acc.find(x => x.key === key)) {
      acc.push({ key, day: s.day_of_week, shift_time: s.shift_time, label: `${s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1,3)} ${s.shift_time}` })
    }
    return acc
  }, [])

  // Unique roles the volunteer is scheduled for
  const myRoles = [...new Set(schedule.map(s => s.role))]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
              Hey, {profile?.full_name?.split(' ')[0]}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {new Date().toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={handleSignOut} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            Sign out
          </button>
        </div>

        {/* Status banner */}
        <div style={{ ...card, marginBottom: '1.5rem', borderColor: activeShift ? 'var(--accent)' : 'var(--border)', background: activeShift ? 'rgba(74,222,128,0.05)' : 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: activeShift ? 'var(--accent)' : 'var(--muted)', boxShadow: activeShift ? '0 0 8px var(--accent)' : 'none' }} />
            <span style={{ fontWeight: 500 }}>
              {activeShift ? `Clocked in since ${formatTime(activeShift.clock_in)}` : 'Not clocked in'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[['clock','Clock'],['schedule','Schedule'],['callout','Call-Out'],['history','History'],['messages','Messages'],['account','Account']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              background: tab === key ? 'var(--accent)' : 'var(--surface)',
              color: tab === key ? '#0a0f0a' : 'var(--muted)',
              border: tab === key ? 'none' : '1px solid var(--border)',
            }}>{label}</button>
          ))}
        </div>

        {/* CLOCK TAB */}
        {tab === 'clock' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Clock In / Out</h2>
            {activeShift ? (
              <button onClick={handleClockOut} disabled={clockLoading} style={{ width: '100%', padding: '1rem', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {clockLoading ? 'Processing...' : 'Clock Out'}
              </button>
            ) : (
              <button onClick={handleClockIn} disabled={clockLoading} style={{ width: '100%', padding: '1rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {clockLoading ? 'Processing...' : 'Clock In'}
              </button>
            )}
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>My Schedule</h2>
            {schedule.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>You have no scheduled shifts yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {DAYS.map(day => {
                  const dayEntries = schedule.filter(s => s.day_of_week === day.toLowerCase())
                  if (dayEntries.length === 0) return null
                  return (
                    <div key={day} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <p style={{ fontWeight: 600, textTransform: 'capitalize', marginBottom: '0.6rem' }}>{day}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {SHIFTS.map(shift => {
                          const shiftEntries = dayEntries.filter(s => s.shift_time === shift)
                          if (shiftEntries.length === 0) return null
                          return shiftEntries.map(entry => (
                            <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.9rem' }}>{entry.role}</span>
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--surface)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>{shift}</span>
                            </div>
                          ))
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* CALLOUT TAB */}
        {tab === 'callout' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Submit a Call-Out</h2>
            <form onSubmit={handleCallout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Date you can't make it</label>
                <input type="date" value={calloutDate} onChange={e => setCalloutDate(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Shift</label>
                <select value={calloutShift} onChange={e => setCalloutShift(e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Reason (optional)</label>
                <textarea value={calloutReason} onChange={e => setCalloutReason(e.target.value)} rows={3} placeholder="Let the team know why..." style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <button type="submit" style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                Submit Call-Out
              </button>
            </form>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Total hours summary */}
            <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(74,222,128,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Total Hours</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', lineHeight: 1 }}>
                  {totalHours()}<span style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '0.25rem', color: 'var(--muted)' }}>hrs</span>
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Completed Shifts</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)', lineHeight: 1 }}>
                  {allShifts.length}
                </p>
              </div>
            </div>

            {/* Recent shifts list */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>
                Recent Shifts
                <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem' }}>— last 10</span>
              </h2>
              {shifts.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No shifts recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {shifts.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{formatDate(s.clock_in)}</p>
                        <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{formatTime(s.clock_in)} → {formatTime(s.clock_out)}</p>
                      </div>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: s.clock_out ? 'var(--accent)' : 'var(--warn)' }}>
                        {calcHours(s.clock_in, s.clock_out)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MESSAGES TAB */}
        {tab === 'messages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[['inbox','Inbox'],['sent','Sent'],['compose','Compose']].map(([key, label]) => (
                <button key={key} onClick={() => setMsgView(key)} style={{
                  padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  background: msgView === key ? 'var(--accent)' : 'var(--surface)',
                  color: msgView === key ? '#0a0f0a' : 'var(--muted)',
                  border: msgView === key ? 'none' : '1px solid var(--border)',
                }}>{label}</button>
              ))}
            </div>

            {msgView === 'inbox' && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Inbox</h2>
                {inboxMessages.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No messages yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {inboxMessages.map(m => (
                      <div key={m.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.sender?.full_name || 'Unknown'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                              {recipientLabel(m)}
                            </span>
                            <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace' }}>{formatDateTime(m.created_at)}</span>
                          </div>
                        </div>
                        <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {msgView === 'sent' && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Sent Messages</h2>
                {sentMessages.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No sent messages yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {sentMessages.map(m => (
                      <div key={m.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--muted)' }}>To: {recipientLabel(m)}</span>
                          <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace' }}>{formatDateTime(m.created_at)}</span>
                        </div>
                        <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {msgView === 'compose' && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>New Message</h2>
                <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Send to</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[
                        { value: 'admin', label: 'Admin' },
                        { value: 'everyone', label: 'Everyone' },
                        ...(myShiftCombos.length > 0 ? [{ value: 'shift', label: 'My Shift' }] : []),
                        ...(myRoles.length > 0 ? [{ value: 'role', label: 'My Role' }] : []),
                      ].map(opt => (
                        <button key={opt.value} type="button" onClick={() => {
                          setMsgRecipientType(opt.value)
                          setMsgSelectedShift(null)
                          setMsgSelectedRole(null)
                        }} style={{
                          padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500,
                          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                          background: msgRecipientType === opt.value ? 'var(--accent)' : 'var(--surface)',
                          color: msgRecipientType === opt.value ? '#0a0f0a' : 'var(--muted)',
                          border: msgRecipientType === opt.value ? 'none' : '1px solid var(--border)',
                        }}>{opt.label}</button>
                      ))}
                    </div>

                    {/* Shift picker — only shown when 'shift' selected */}
                    {msgRecipientType === 'shift' && myShiftCombos.length > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which shift</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {myShiftCombos.map(combo => {
                            const active = msgSelectedShift?.key === combo.key
                            return (
                              <button key={combo.key} type="button" onClick={() => setMsgSelectedShift(combo)} style={{
                                padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500,
                                cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                                background: active ? '#1e40af' : 'var(--surface)',
                                color: active ? '#bfdbfe' : 'var(--muted)',
                                border: active ? 'none' : '1px solid var(--border)',
                              }}>{combo.label}</button>
                            )
                          })}
                        </div>
                        {myShiftCombos.length === 1 && !msgSelectedShift && (
                          <p style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Select a shift above to continue.</p>
                        )}
                      </div>
                    )}

                    {/* Role picker — only shown when 'role' selected */}
                    {msgRecipientType === 'role' && myRoles.length > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which role</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {myRoles.map(role => {
                            const active = msgSelectedRole === role
                            return (
                              <button key={role} type="button" onClick={() => setMsgSelectedRole(role)} style={{
                                padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500,
                                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                                background: active ? 'var(--accent)' : 'var(--surface)',
                                color: active ? '#0a0f0a' : 'var(--muted)',
                                border: active ? 'none' : '1px solid var(--border)',
                              }}>{role}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>Message</label>
                    <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} required rows={4} placeholder="Write your message..." style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      sendingMsg ||
                      !msgBody.trim() ||
                      (msgRecipientType === 'shift' && !msgSelectedShift) ||
                      (msgRecipientType === 'role' && !msgSelectedRole)
                    }
                    style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: sendingMsg ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {sendingMsg ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ACCOUNT TAB */}
        {tab === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Change Password</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Must be at least 6 characters.</p>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    placeholder="New password"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repeat new password"
                    style={inputStyle}
                  />
                </div>
                <button
                  type="submit"
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: changingPassword ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                >
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: toast.type === 'success' ? '#0a0f0a' : '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  )
}