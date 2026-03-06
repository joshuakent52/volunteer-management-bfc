'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export const dynamic = 'force-dynamic'

export default function VolunteerPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeShift, setActiveShift] = useState(null)
  const [shifts, setShifts] = useState([])
  const [calloutDate, setCalloutDate] = useState('')
  const [calloutReason, setCalloutReason] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [clockLoading, setClockLoading] = useState(false)
  const [tab, setTab] = useState('clock') // 'clock' | 'callout' | 'history'

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/'; return }
    setUser(user)

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    setProfile(profile)

    // Check for open shift (no clock_out)
    const { data: open } = await supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', user.id)
      .is('clock_out', null)
      .single()
    setActiveShift(open || null)

    // Recent shifts
    const { data: history } = await supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', user.id)
      .order('clock_in', { ascending: false })
      .limit(10)
    setShifts(history || [])
    setLoading(false)
  }

  async function handleClockIn() {
    setClockLoading(true)
    const { data, error } = await supabase
      .from('shifts')
      .insert({ volunteer_id: user.id, clock_in: new Date().toISOString() })
      .select().single()
    if (error) { showMessage(error.message, 'error') }
    else { setActiveShift(data); showMessage('Clocked in successfully!', 'success') }
    setClockLoading(false)
  }

  async function handleClockOut() {
    setClockLoading(true)
    const { error } = await supabase
      .from('shifts')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', activeShift.id)
    if (error) { showMessage(error.message, 'error') }
    else { setActiveShift(null); showMessage('Clocked out. Great work!', 'success'); init() }
    setClockLoading(false)
  }

  async function handleCallout(e) {
    e.preventDefault()
    const { error } = await supabase
      .from('callouts')
      .insert({ volunteer_id: user.id, callout_date: calloutDate, reason: calloutReason })
    if (error) { showMessage(error.message, 'error') }
    else { showMessage('Call-out submitted!', 'success'); setCalloutDate(''); setCalloutReason('') }
  }

  function showMessage(text, type) {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3500)
  }

  function formatTime(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  function calcHours(clock_in, clock_out) {
    if (!clock_out) return 'Active'
    const diff = (new Date(clock_out) - new Date(clock_in)) / 1000 / 60 / 60
    return diff.toFixed(1) + 'h'
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>👋 Hey, {profile?.full_name?.split(' ')[0]}</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <button onClick={handleSignOut} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            Sign out
          </button>
        </div>

        {/* Status banner */}
        <div style={{ ...card, marginBottom: '1.5rem', borderColor: activeShift ? 'var(--accent)' : 'var(--border)', background: activeShift ? 'rgba(74,222,128,0.05)' : 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: activeShift ? 'var(--accent)' : 'var(--muted)', boxShadow: activeShift ? '0 0 8px var(--accent)' : 'none' }} />
            <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>
              {activeShift ? `Clocked in since ${formatTime(activeShift.clock_in)}` : 'Not clocked in'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {[['clock', '⏱ Clock'], ['callout', '📋 Call-Out'], ['history', '📅 History']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              background: tab === key ? 'var(--accent)' : 'var(--surface)',
              color: tab === key ? '#0a0f0a' : 'var(--muted)',
              border: tab === key ? 'none' : '1px solid var(--border)',
            }}>{label}</button>
          ))}
        </div>

        {/* Clock Tab */}
        {tab === 'clock' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Clock In / Out</h2>
            {activeShift ? (
              <button onClick={handleClockOut} disabled={clockLoading} style={{
                width: '100%', padding: '1rem', background: 'var(--danger)', color: '#fff',
                border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}>
                {clockLoading ? 'Processing...' : '🔴 Clock Out'}
              </button>
            ) : (
              <button onClick={handleClockIn} disabled={clockLoading} style={{
                width: '100%', padding: '1rem', background: 'var(--accent)', color: '#0a0f0a',
                border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}>
                {clockLoading ? 'Processing...' : '🟢 Clock In'}
              </button>
            )}
          </div>
        )}

        {/* Call-out Tab */}
        {tab === 'callout' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Submit a Call-Out</h2>
            <form onSubmit={handleCallout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date you can't make it</label>
                <input type="date" value={calloutDate} onChange={e => setCalloutDate(e.target.value)} required
                  style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason (optional)</label>
                <textarea value={calloutReason} onChange={e => setCalloutReason(e.target.value)} rows={3} placeholder="Let the team know why..."
                  style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', resize: 'vertical', fontFamily: 'DM Sans, sans-serif' }} />
              </div>
              <button type="submit" style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                Submit Call-Out
              </button>
            </form>
          </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>My Shift History</h2>
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
        )}

        {/* Toast message */}
        {message && (
          <div style={{
            position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
            background: message.type === 'success' ? 'var(--accent)' : 'var(--danger)',
            color: message.type === 'success' ? '#0a0f0a' : '#fff',
            padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}
