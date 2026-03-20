'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { card } from '../../lib/styles'

export default function CalloutsTab({ callouts, coverRequests, onCalloutsChange, onCoverRequestsChange, showMessage }) {
  const [showReadCallouts, setShowReadCallouts] = useState(false)
  const [approvingCoverId, setApprovingCoverId] = useState(null)

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
  const pendingCallouts  = callouts.filter(c => (!c.status || c.status === 'pending') && c.callout_date >= todayStr)
  const approvedCallouts = callouts.filter(c => c.status === 'approved' && !c.covered_by && c.callout_date >= todayStr)
  const closedCallouts   = callouts.filter(c => c.status === 'denied' || (c.status === 'approved' && c.covered_by))
  const pendingCovers    = coverRequests.filter(r => r.status === 'pending')

  async function approveCallout(callout) {
    const { error } = await supabase.from('callouts').update({ status: 'approved', is_read: true }).eq('id', callout.id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Callout approved — shift is now open for coverage', 'success'); onCalloutsChange() }
  }

  async function denyCallout(id) {
    const { error } = await supabase.from('callouts').update({ status: 'denied', is_read: true }).eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Callout denied.', 'success'); onCalloutsChange() }
  }

  async function approveCover(req) {
    setApprovingCoverId(req.id)
    const callout = callouts.find(c => c.id === req.callout_id)
    if (!callout) { showMessage('Callout not found', 'error'); setApprovingCoverId(null); return }
    const { error: covErr } = await supabase.from('callouts').update({ covered_by: req.volunteer_id }).eq('id', req.callout_id)
    if (covErr) { showMessage(covErr.message, 'error'); setApprovingCoverId(null); return }
    await supabase.from('shift_cover_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', req.id)
    await supabase.from('shift_cover_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('callout_id', req.callout_id).neq('id', req.id)
    showMessage(`${req.profiles?.full_name} approved to cover shift!`, 'success')
    onCalloutsChange()
    onCoverRequestsChange()
    setApprovingCoverId(null)
  }

  async function denyCover(id) {
    setApprovingCoverId(id)
    const { error } = await supabase.from('shift_cover_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Cover request denied.', 'success'); onCoverRequestsChange() }
    setApprovingCoverId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Pending callouts */}
      <div style={card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>
          Pending Call-Outs
          {pendingCallouts.length > 0 && (
            <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>
              {pendingCallouts.length}
            </span>
          )}
        </h2>
        {pendingCallouts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No pending call-outs.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingCallouts.map(c => (
              <div key={c.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{c.profiles?.full_name}</span>
                    <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'capitalize' }}>
                      {c.callout_date} · {c.day_of_week} {c.shift_time}
                    </span>
                    {c.role && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)' }}>{c.role}</span>}
                    {c.reason && <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem', fontStyle: 'italic' }}>{c.reason}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => approveCallout(c)} style={{ padding: '0.3rem 0.8rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✓ Approve</button>
                    <button onClick={() => denyCallout(c.id)} style={{ padding: '0.3rem 0.8rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕ Deny</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open shifts / cover requests */}
      {(approvedCallouts.length > 0 || pendingCovers.length > 0) && (
        <div style={card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>
            Open Shifts — Awaiting Coverage
            {pendingCovers.length > 0 && (
              <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>
                {pendingCovers.length} request{pendingCovers.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {approvedCallouts.filter(c => !c.covered_by).map(c => {
              const requests = coverRequests.filter(r => r.callout_id === c.id)
              const pending  = requests.filter(r => r.status === 'pending')
              return (
                <div key={c.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.35)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pending.length > 0 ? '0.75rem' : 0, flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: '0.85rem' }}>Called out: </span>
                      <span style={{ fontWeight: 600 }}>{c.profiles?.full_name}</span>
                      <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)' }}>{c.callout_date} · {c.day_of_week} {c.shift_time}</span>
                      {c.role && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)' }}>{c.role}</span>}
                    </div>
                    {pending.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>No volunteers yet</span>}
                  </div>
                  {pending.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {pending.map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                          <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{r.profiles?.full_name}</span>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={() => approveCover(r)} disabled={approvingCoverId === r.id}
                              style={{ padding: '0.25rem 0.7rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                              {approvingCoverId === r.id ? '...' : '✓ Assign'}
                            </button>
                            <button onClick={() => denyCover(r.id)} disabled={approvingCoverId === r.id}
                              style={{ padding: '0.25rem 0.7rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Covered / Closed */}
      {closedCallouts.length > 0 && (
        <div style={card}>
          <button onClick={() => setShowReadCallouts(!showReadCallouts)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.9rem', fontWeight: 500, padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-block', transform: showReadCallouts ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>›</span>
            Covered / Closed ({closedCallouts.length})
          </button>
          {showReadCallouts && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {closedCallouts.map(c => (
                <div key={c.id} style={{ padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', opacity: 0.65, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{c.profiles?.full_name}</span>
                    <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>{c.callout_date} · {c.shift_time}</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: c.covered_by ? 'rgba(2,65,107,0.1)' : 'rgba(239,68,68,0.08)', color: c.covered_by ? 'var(--accent)' : '#ef4444', border: `1px solid ${c.covered_by ? 'rgba(2,65,107,0.35)' : 'rgba(239,68,68,0.25)'}` }}>
                    {c.covered_by ? 'covered' : 'denied'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
