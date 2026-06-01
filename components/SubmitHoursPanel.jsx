// components/SubmitHoursPanel.jsx
'use client'
import { useState, useEffect } from 'react'

const S = {
  input: {
    width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)',
    border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)',
    fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif',
  },
  label: {
    display: 'block', fontSize: '0.8rem', color: 'var(--muted)',
    marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '1.5rem',
  },
}

export function SubmitHoursPanel({ supabase, userId, roles, showToast, defaultRole }) {
  const [hoursRole, setHoursRole] = useState(defaultRole || '')
  const [hoursDate, setHoursDate]       = useState('')
  const [hoursWorked, setHoursWorked]   = useState('')
  const [hoursNotes, setHoursNotes]     = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [submissions, setSubmissions]   = useState([])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('hours_submissions')
      .select('id, work_date, role, hours, notes, status, submitted_at')
      .eq('volunteer_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setSubmissions(data || []))
  }, [userId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!hoursDate || !hoursRole || !hoursWorked) return
    setSubmitting(true)
    const { error } = await supabase.from('hours_submissions').insert({
      volunteer_id: userId, work_date: hoursDate, role: hoursRole,
      hours: parseFloat(hoursWorked), notes: hoursNotes || null, status: 'pending',
    })
    if (error) {
      showToast(error.message, 'error')
    } else {
      showToast('Hours submitted for approval!', 'success')
      setHoursDate(''); setHoursRole(''); setHoursWorked(''); setHoursNotes('')
      const { data } = await supabase
        .from('hours_submissions')
        .select('id, work_date, role, hours, notes, status, submitted_at')
        .eq('volunteer_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(20)
      setSubmissions(data || [])
    }
    setSubmitting(false)
  }

  return (
    <div style={S.card}>
      <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Submit Hours</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Submit hours worked outside of the clock-in system for admin approval.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={S.label}>Date Worked</label>
          <input type="date" value={hoursDate} onChange={e => setHoursDate(e.target.value)} required style={S.input} />
        </div>
        <div>
          <label style={S.label}>Role</label>
          <select value={hoursRole} onChange={e => setHoursRole(e.target.value)} required style={S.input}>
            <option value="">— Select role —</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Hours Worked</label>
          <input type="number" min="0.5" max="12" step="0.5" value={hoursWorked}
            onChange={e => setHoursWorked(e.target.value)} required placeholder="e.g. 4" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Notes (optional)</label>
          <textarea value={hoursNotes} onChange={e => setHoursNotes(e.target.value)}
            rows={2} placeholder="Any context for the admin..." style={{ ...S.input, resize: 'vertical' }} />
        </div>
        <button
          type="submit"
          disabled={submitting || !hoursDate || !hoursRole || !hoursWorked}
          style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: '8px', fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
            cursor: submitting ? 'not-allowed' : 'pointer' }}
        >
          {submitting ? 'Submitting...' : 'Submit Hours'}
        </button>
      </form>

      {submissions.length > 0 && (
        <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Your Submissions
          </p>
          {submissions.map(h => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.6rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{h.work_date}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{h.role}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem' }}>{h.hours}h</span>
                <span style={{
                  fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 500,
                  background: h.status === 'approved' ? 'rgba(74,222,128,0.12)' : h.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.12)',
                  color: h.status === 'approved' ? 'var(--accent)' : h.status === 'rejected' ? '#ef4444' : 'var(--warn)',
                  border: `1px solid ${h.status === 'approved' ? 'rgba(74,222,128,0.3)' : h.status === 'rejected' ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.3)'}`,
                }}>
                  {h.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}