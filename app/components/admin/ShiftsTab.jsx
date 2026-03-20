'use client'
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { ROLES } from '../../../lib/constants'
import { toMountainInputValue, fromMountainInputValue, formatDateTime, calcShiftHours } from '../../../lib/timeUtils'
import { card, inputStyle, labelStyle } from '../../../lib/styles'

export default function ShiftsTab({ volunteers, tzLabel, showMessage, onShiftsChange }) {
  const [allShifts, setAllShifts] = useState([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [editingShiftId, setEditingShiftId] = useState(null)
  const [shiftEditForm, setShiftEditForm] = useState({})
  const [savingShift, setSavingShift] = useState(false)
  const [showNewShiftForm, setShowNewShiftForm] = useState(false)
  const [newShiftForm, setNewShiftForm] = useState({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
  const [creatingShift, setCreatingShift] = useState(false)
  const [shiftFilterVolId, setShiftFilterVolId] = useState('')

  async function loadAllShifts() {
    setShiftsLoading(true)
    const { data } = await supabase
      .from('shifts')
      .select('*, profiles(id, full_name)')
      .order('clock_in', { ascending: false })
      .limit(200)
    setAllShifts(data || [])
    setShiftsLoading(false)
    setLoaded(true)
  }

  // Load on first render of this tab
  if (!loaded && !shiftsLoading) loadAllShifts()

  async function handleShiftEditSave(shiftId) {
    setSavingShift(true)
    const clockIn = fromMountainInputValue(shiftEditForm.clock_in)
    const clockOut = shiftEditForm.clock_out ? fromMountainInputValue(shiftEditForm.clock_out) : null
    const { error } = await supabase.from('shifts')
      .update({ clock_in: clockIn, clock_out: clockOut, role: shiftEditForm.role || null })
      .eq('id', shiftId)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Shift updated!', 'success')
      setEditingShiftId(null)
      await loadAllShifts()
      onShiftsChange()
    }
    setSavingShift(false)
  }

  async function handleShiftDelete(shiftId) {
    if (!confirm('Delete this shift entry? This cannot be undone.')) return
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Shift deleted.', 'success')
      await loadAllShifts()
      onShiftsChange()
    }
  }

  async function handleCreateShift(e) {
    e.preventDefault()
    if (!newShiftForm.volunteer_id || !newShiftForm.clock_in) return
    setCreatingShift(true)
    const clockIn = fromMountainInputValue(newShiftForm.clock_in)
    const clockOut = newShiftForm.clock_out ? fromMountainInputValue(newShiftForm.clock_out) : null
    const { error } = await supabase.from('shifts').insert({
      volunteer_id: newShiftForm.volunteer_id,
      clock_in: clockIn,
      clock_out: clockOut,
      role: newShiftForm.role || null,
    })
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Shift entry created!', 'success')
      setNewShiftForm({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
      setShowNewShiftForm(false)
      await loadAllShifts()
      onShiftsChange()
    }
    setCreatingShift(false)
  }

  const filteredShifts = shiftFilterVolId
    ? allShifts.filter(s => s.volunteer_id === shiftFilterVolId)
    : allShifts

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* New Entry Form */}
      {showNewShiftForm && (
        <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)' }}>
          <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>New Shift Entry</h2>
          <form onSubmit={handleCreateShift} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Volunteer</label>
              <select value={newShiftForm.volunteer_id} onChange={e => setNewShiftForm({ ...newShiftForm, volunteer_id: e.target.value })} required style={inputStyle}>
                <option value="">— Select volunteer —</option>
                {volunteers.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Clock In ({tzLabel})</label>
                <input type="datetime-local" value={newShiftForm.clock_in} onChange={e => setNewShiftForm({ ...newShiftForm, clock_in: e.target.value })} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Clock Out ({tzLabel}) <span style={{ color: 'var(--muted)', textTransform: 'none', fontSize: '0.75rem' }}>— leave blank if active</span></label>
                <input type="datetime-local" value={newShiftForm.clock_out} onChange={e => setNewShiftForm({ ...newShiftForm, clock_out: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Position</label>
              <select value={newShiftForm.role} onChange={e => setNewShiftForm({ ...newShiftForm, role: e.target.value })} style={inputStyle}>
                <option value="">— No role —</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" disabled={creatingShift} style={{ flex: 1, padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creatingShift ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {creatingShift ? 'Creating...' : 'Create Entry'}
              </button>
              <button type="button" onClick={() => { setShowNewShiftForm(false); setNewShiftForm({ volunteer_id: '', clock_in: '', clock_out: '', role: '' }) }} style={{ padding: '0.85rem 1.25rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ fontWeight: 600 }}>All Shift Entries <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— last 200</span></h2>
          <button onClick={() => { setShowNewShiftForm(true); setEditingShiftId(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>
            + New Entry
          </button>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Filter by volunteer</label>
          <select value={shiftFilterVolId} onChange={e => setShiftFilterVolId(e.target.value)} style={{ ...inputStyle, maxWidth: '320px' }}>
            <option value="">All volunteers</option>
            {volunteers.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
          </select>
        </div>

        {shiftsLoading ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading shifts...</p>
        ) : filteredShifts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No shift entries found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {filteredShifts.map(s => {
              const isEditing = editingShiftId === s.id
              const hours = calcShiftHours(s.clock_in, s.clock_out)
              return (
                <div key={s.id} style={{ padding: '0.85rem 1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'}`, transition: 'border-color 0.15s' }}>
                  {!isEditing ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent)', flexShrink: 0 }}>
                          {s.profiles?.full_name?.charAt(0)}
                        </div>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.profiles?.full_name}</p>
                          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', fontFamily: 'DM Mono, monospace' }}>
                            {formatDateTime(s.clock_in)} → {s.clock_out ? formatDateTime(s.clock_out) : <span style={{ color: 'var(--accent)' }}>active</span>}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {s.role
                          ? <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.role}</span>
                          : <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', fontStyle: 'italic' }}>no role</span>
                        }
                        {hours !== null
                          ? <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>{hours}h</span>
                          : <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(2,65,107,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(2,65,107,0.35)' }}>active</span>
                        }
                        <button onClick={() => { setEditingShiftId(s.id); setShiftEditForm({ clock_in: toMountainInputValue(s.clock_in), clock_out: toMountainInputValue(s.clock_out), role: s.role || '' }) }}
                          style={{ padding: '0.3rem 0.7rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                          Edit
                        </button>
                        <button onClick={() => handleShiftDelete(s.id)}
                          style={{ padding: '0.3rem 0.7rem', background: 'rgba(248,113,113,0.08)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--accent)' }}>Editing: {s.profiles?.full_name}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={labelStyle}>Clock In ({tzLabel})</label>
                          <input type="datetime-local" value={shiftEditForm.clock_in} onChange={e => setShiftEditForm({ ...shiftEditForm, clock_in: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Clock Out ({tzLabel}) <span style={{ color: 'var(--muted)', textTransform: 'none', fontSize: '0.75rem' }}>— clear to mark active</span></label>
                          <input type="datetime-local" value={shiftEditForm.clock_out} onChange={e => setShiftEditForm({ ...shiftEditForm, clock_out: e.target.value })} style={inputStyle} />
                        </div>
                      </div>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={labelStyle}>Position</label>
                        <select value={shiftEditForm.role} onChange={e => setShiftEditForm({ ...shiftEditForm, role: e.target.value })} style={inputStyle}>
                          <option value="">— No role —</option>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleShiftEditSave(s.id)} disabled={savingShift}
                          style={{ padding: '0.55rem 1.1rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: savingShift ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>
                          {savingShift ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingShiftId(null)}
                          style={{ padding: '0.55rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
