'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fromMountainInputValue } from '../../lib/timeUtils'
import { card } from '../../lib/styles'

export default function HoursTab({ showMessage }) {
  const [hoursSubmissions, setHoursSubmissions] = useState([])
  const [hoursLoading, setHoursLoading] = useState(false)
  const [approvingHoursId, setApprovingHoursId] = useState(null)

  useEffect(() => { loadHoursSubmissions() }, [])

  async function loadHoursSubmissions() {
    setHoursLoading(true)
    const { data } = await supabase
      .from('hours_submissions')
      .select('*, profiles(full_name)')
      .order('submitted_at', { ascending: false })
      .limit(100)
    setHoursSubmissions(data || [])
    setHoursLoading(false)
  }

  async function approveHours(sub) {
    setApprovingHoursId(sub.id)
    const clockInMtn = `${sub.work_date}T09:00`
    const clockInUTC = fromMountainInputValue(clockInMtn)
    const clockOutUTC = new Date(new Date(clockInUTC).getTime() + sub.hours * 3600000).toISOString()
    const { error: shiftErr } = await supabase.from('shifts').insert({
      volunteer_id: sub.volunteer_id,
      clock_in: clockInUTC,
      clock_out: clockOutUTC,
      role: sub.role,
    })
    if (shiftErr) { showMessage(shiftErr.message, 'error'); setApprovingHoursId(null); return }
    const { error: statusErr } = await supabase.from('hours_submissions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', sub.id)
    if (statusErr) showMessage(statusErr.message, 'error')
    else { showMessage('Hours approved and shift created!', 'success'); await loadHoursSubmissions() }
    setApprovingHoursId(null)
  }

  async function rejectHours(id) {
    setApprovingHoursId(id)
    const { error } = await supabase.from('hours_submissions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Submission rejected.', 'success'); await loadHoursSubmissions() }
    setApprovingHoursId(null)
  }

  const pending  = hoursSubmissions.filter(h => h.status === 'pending')
  const reviewed = hoursSubmissions.filter(h => h.status !== 'pending')

  if (hoursLoading) return <p style={{ color: 'var(--muted)', padding: '1rem' }}>Loading...</p>
  if (hoursSubmissions.length === 0) return <div style={card}><p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No hours submissions yet.</p></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {pending.length > 0 && (
        <div style={card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>
            Pending Approval
            <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>
              {pending.length}
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pending.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{h.profiles?.full_name}</p>
                  <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{h.work_date} &nbsp;·&nbsp; {h.role} &nbsp;·&nbsp; <span style={{ fontFamily: 'DM Mono, monospace' }}>{h.hours}h</span></p>
                  {h.notes && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>{h.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => approveHours(h)} disabled={approvingHoursId === h.id}
                    style={{ padding: '0.4rem 0.9rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {approvingHoursId === h.id ? '...' : '✓ Approve'}
                  </button>
                  <button onClick={() => rejectHours(h.id)} disabled={approvingHoursId === h.id}
                    style={{ padding: '0.4rem 0.9rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div style={card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)' }}>Previously Reviewed</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {reviewed.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', opacity: 0.75 }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{h.profiles?.full_name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{h.work_date} · {h.role} · {h.hours}h</span>
                </div>
                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 500, background: h.status === 'approved' ? 'rgba(2,65,107,0.12)' : 'rgba(239,68,68,0.1)', color: h.status === 'approved' ? 'var(--accent)' : '#ef4444', border: `1px solid ${h.status === 'approved' ? 'rgba(2,65,107,0.35)' : 'rgba(239,68,68,0.25)'}` }}>
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
