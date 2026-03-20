'use client'
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { ROLES } from '../../../lib/constants'
import { totalHours } from '../../../lib/timeUtils'
import { card, inputStyle, labelStyle, affiliationColor, badgeStyle } from '../../../lib/styles'

export default function VolunteersTab({ volunteers, onVolunteersChange, showMessage }) {
  const [selectedVolunteer, setSelectedVolunteer] = useState(null)
  const [editing, setEditing] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [statusForm, setStatusForm] = useState({ status: 'active', status_reason: '' })
  const [changingStatus, setChangingStatus] = useState(false)

  const volunteerList = volunteers
    .filter(v => v.role === 'volunteer' && (showInactive ? true : (v.status || 'active') === 'active'))
    .sort((a, b) => {
      const lastName = n => (n?.full_name?.split(' ').slice(-1)[0] || '').toLowerCase()
      return lastName(a).localeCompare(lastName(b))
    })

  function openVolunteer(v) {
    setSelectedVolunteer(v)
    setEditForm({
      full_name: v.full_name||'', email: v.email||'', phone: v.phone||'',
      affiliation: v.affiliation||'', credentials: v.credentials||'',
      languages: v.languages||'', role: v.role||'volunteer',
      sma_name: v.sma_name||'', sma_contact: v.sma_contact||'', school: v.school||'',
      default_role: v.default_role||'',
      birthday: v.birthday||'',
    })
    setStatusForm({ status: v.status || 'active', status_reason: v.status_reason || '' })
    setEditing(false)
  }

  async function handleSaveEdit() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name, phone: editForm.phone,
      affiliation: editForm.affiliation || null,
      credentials: editForm.credentials || null,
      languages: editForm.languages, role: editForm.role,
      sma_name: editForm.affiliation === 'missionary' ? (editForm.sma_name||null) : null,
      sma_contact: editForm.affiliation === 'missionary' ? (editForm.sma_contact||null) : null,
      school: editForm.affiliation === 'student' ? (editForm.school||null) : null,
      default_role: editForm.default_role || null,
      birthday: editForm.birthday || null,
    }).eq('id', selectedVolunteer.id)
    if (error) { showMessage(error.message, 'error'); setSaving(false); return }
    const { data: fresh } = await supabase.from('profiles').select('*, shifts(*)').eq('id', selectedVolunteer.id).single()
    showMessage('Profile updated!', 'success')
    setEditing(false)
    setSelectedVolunteer(fresh)
    onVolunteersChange()
    setSaving(false)
  }

  async function handleStatusChange(newStatus, reason) {
    setChangingStatus(true)
    const isDeactivating = newStatus === 'inactive'
    const { error } = await supabase.from('profiles').update({
      status: newStatus,
      status_reason: isDeactivating ? (reason || null) : null,
      status_changed_at: new Date().toISOString(),
    }).eq('id', selectedVolunteer.id)
    if (error) { showMessage(error.message, 'error'); setChangingStatus(false); return }
    const { data: fresh } = await supabase.from('profiles').select('*, shifts(*)').eq('id', selectedVolunteer.id).single()
    showMessage(isDeactivating ? 'Volunteer deactivated.' : 'Volunteer reactivated!', 'success')
    setSelectedVolunteer(fresh)
    onVolunteersChange()
    setChangingStatus(false)
  }

  // ── LIST VIEW ──
  if (!selectedVolunteer) return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 600 }}>All Volunteers <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— click to view or edit</span></h2>
        <button onClick={() => setShowInactive(s => !s)} style={{ padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: showInactive ? 'rgba(156,163,175,0.15)' : 'var(--surface)', color: showInactive ? 'var(--text)' : 'var(--muted)', border: '1px solid var(--border)' }}>
          {showInactive ? 'Hide Inactive' : 'Show Inactive'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {volunteerList.map(v => {
          const isInactive = (v.status || 'active') === 'inactive'
          return (
            <div key={v.id} onClick={() => openVolunteer(v)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: isInactive ? 'rgba(156,163,175,0.06)' : 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', opacity: isInactive ? 0.7 : 1 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>
                  {v.full_name?.charAt(0)}
                </div>
                <div>
                  <p style={{ fontWeight: 500, color: isInactive ? 'var(--muted)' : 'var(--text)' }}>{v.full_name}</p>
                  <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{v.email}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {isInactive && <span style={badgeStyle('#9ca3af')}>inactive</span>}
                {v.affiliation && <span style={badgeStyle(affiliationColor[v.affiliation] || '#9ca3af')}>{v.affiliation}</span>}
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>{totalHours(v.shifts)}h</span>
                <span style={{ color: 'var(--muted)' }}>›</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── DETAIL VIEW ──
  const isInactive = (selectedVolunteer.status || 'active') === 'inactive'
  return (
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
        <button onClick={() => setEditing(!editing)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: editing ? 'var(--surface)' : 'var(--accent)', color: editing ? 'var(--muted)' : '#0a0f0a', border: editing ? '1px solid var(--border)' : 'none' }}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {!editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {[
              { label: 'Phone', value: selectedVolunteer.phone },
              { label: 'Affiliation', value: selectedVolunteer.affiliation },
              { label: 'Credentials / Skills', value: selectedVolunteer.credentials },
              { label: 'Languages', value: selectedVolunteer.languages },
              { label: 'Total Hours', value: totalHours(selectedVolunteer.shifts) + 'h' },
              { label: 'Role', value: selectedVolunteer.role },
              { label: 'Default Position', value: selectedVolunteer.default_role },
              { label: 'Birthday', value: selectedVolunteer.birthday },
              ...(selectedVolunteer.affiliation === 'missionary' ? [
                { label: 'SMA Name', value: selectedVolunteer.sma_name },
                { label: 'SMA Contact', value: selectedVolunteer.sma_contact },
              ] : []),
              ...(selectedVolunteer.affiliation === 'student' ? [
                { label: 'School', value: selectedVolunteer.school },
              ] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{label}</p>
                <p style={{ fontWeight: 500, color: value ? 'var(--text)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</p>
              </div>
            ))}
          </div>

          {/* Status panel */}
          <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: `1px solid ${isInactive ? 'rgba(156,163,175,0.4)' : 'rgba(2,65,107,0.35)'}`, background: isInactive ? 'rgba(156,163,175,0.06)' : 'rgba(2,65,107,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Status</p>
                <p style={{ fontWeight: 600, color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>{isInactive ? 'Inactive' : 'Active'}</p>
                {isInactive && selectedVolunteer.status_reason && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>Reason: {selectedVolunteer.status_reason}</p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '200px' }}>
                {!isInactive && (
                  <select value={statusForm.status_reason} onChange={e => setStatusForm({ ...statusForm, status_reason: e.target.value })} style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                    <option value="">— Reason for deactivating —</option>
                    <option value="Graduated">Graduated</option>
                    <option value="Mission / Service Term Ended">Mission / Service Term Ended</option>
                    <option value="Schedule Conflict">Schedule Conflict</option>
                    <option value="Moved Away">Moved Away</option>
                    <option value="Personal / Unknown">Personal / Unknown</option>
                  </select>
                )}
                <button
                  onClick={() => handleStatusChange(isInactive ? 'active' : 'inactive', statusForm.status_reason)}
                  disabled={changingStatus || (!isInactive && !statusForm.status_reason)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: (changingStatus || (!isInactive && !statusForm.status_reason)) ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', border: 'none', background: isInactive ? 'var(--accent)' : '#dc2626', color: isInactive ? '#0a0f0a' : '#fff', opacity: (!isInactive && !statusForm.status_reason) ? 0.5 : 1 }}
                >
                  {changingStatus ? 'Saving...' : isInactive ? 'Reactivate' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
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
            <div><label style={labelStyle}>Credentials / Skills</label><input type="text" value={editForm.credentials} onChange={e => setEditForm({...editForm, credentials: e.target.value})} placeholder="e.g. EMT, Phlebotomy" style={inputStyle} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Languages</label><input value={editForm.languages} onChange={e => setEditForm({...editForm, languages: e.target.value})} placeholder="e.g. Spanish, French" style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Role</label>
              <select value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} style={inputStyle}>
                <option value="volunteer">Volunteer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Default Position</label>
              <select value={editForm.default_role} onChange={e => setEditForm({...editForm, default_role: e.target.value})} style={inputStyle}>
                <option value="">— None —</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Birthday</label>
              <input type="date" value={editForm.birthday || ''} onChange={e => setEditForm({ ...editForm, birthday: e.target.value })} style={inputStyle} />
            </div>
            {editForm.affiliation === 'missionary' && <>
              <div><label style={labelStyle}>SMA Name</label><input value={editForm.sma_name} onChange={e => setEditForm({...editForm, sma_name: e.target.value})} placeholder="SMA full name" style={inputStyle} /></div>
              <div><label style={labelStyle}>SMA Contact</label><input value={editForm.sma_contact} onChange={e => setEditForm({...editForm, sma_contact: e.target.value})} placeholder="Phone or email" style={inputStyle} /></div>
            </>}
            {editForm.affiliation === 'student' && <>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>School</label><input value={editForm.school} onChange={e => setEditForm({...editForm, school: e.target.value})} placeholder="University or college name" style={inputStyle} /></div>
            </>}
          </div>
          <button onClick={handleSaveEdit} disabled={saving} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}
