'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  const [profile, setProfile] = useState(null)
  const [volunteers, setVolunteers] = useState([])
  const [activeShifts, setActiveShifts] = useState([])
  const [callouts, setCallouts] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)

  const [selectedVolunteer, setSelectedVolunteer] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('volunteer')
  const [newAffiliation, setNewAffiliation] = useState('')
  const [newParking, setNewParking] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newLanguages, setNewLanguages] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/'; return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (p?.role !== 'admin') { window.location.href = '/volunteer'; return }
    setProfile(p)
    await Promise.all([loadVolunteers(), loadActiveShifts(), loadCallouts()])
    setLoading(false)
  }

  async function loadVolunteers() {
    const { data } = await supabase
      .from('profiles')
      .select('*, shifts(*)')
      .order('full_name')
    setVolunteers(data || [])
  }

  async function loadActiveShifts() {
    const { data } = await supabase
      .from('shifts')
      .select('*, profiles(full_name)')
      .is('clock_out', null)
    setActiveShifts(data || [])
  }

  async function loadCallouts() {
    const { data } = await supabase
      .from('callouts')
      .select('*, profiles(full_name)')
      .order('callout_date', { ascending: false })
      .limit(20)
    setCallouts(data || [])
  }

  function openVolunteer(v) {
    setSelectedVolunteer(v)
    setEditForm({
      full_name: v.full_name || '',
      email: v.email || '',
      phone: v.phone || '',
      affiliation: v.affiliation || '',
      parking_pass: v.parking_pass || '',
      languages: v.languages || '',
      role: v.role || 'volunteer',
    })
    setEditing(false)
  }

  async function handleSaveEdit() {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editForm.full_name,
        phone: editForm.phone,
        affiliation: editForm.affiliation || null,
        parking_pass: editForm.parking_pass ? parseInt(editForm.parking_pass) : null,
        languages: editForm.languages,
        role: editForm.role,
      })
      .eq('id', selectedVolunteer.id)

    if (error) { showMessage(error.message, 'error') }
    else {
      showMessage('Profile updated!', 'success')
      setEditing(false)
      await loadVolunteers()
      setSelectedVolunteer({ ...selectedVolunteer, ...editForm })
    }
    setSaving(false)
  }

  async function handleCreateVolunteer(e) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await supabase.auth.signUp({ email: newEmail, password: newPassword })
    if (error) { showMessage(error.message, 'error'); setCreating(false); return }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      full_name: newName,
      email: newEmail,
      role: newRole,
      affiliation: newAffiliation || null,
      parking_pass: newParking ? parseInt(newParking) : null,
      phone: newPhone || null,
      languages: newLanguages || null,
    })

    if (profileError) { showMessage(profileError.message, 'error') }
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

  function formatTime(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
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
  const affiliationColor = { missionary: '#a78bfa', student: '#60a5fa', volunteer: '#4ade80', provider: '#fbbf24' }
  const badgeStyle = (color) => ({ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500, background: color + '22', color: color, border: `1px solid ${color}55` })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>🛠 Admin Dashboard</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Bingham Family Clinic</p>
          </div>
          <button onClick={handleSignOut} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            Sign out
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Volunteers', value: volunteers.filter(v => v.role === 'volunteer').length },
            { label: 'Clocked In Now', value: activeShifts.length, accent: true },
            { label: 'Pending Call-Outs', value: callouts.length },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', borderColor: s.accent ? 'var(--accent)' : 'var(--border)' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.accent ? 'var(--accent)' : 'var(--text)' }}>{s.value}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[['dashboard', '📊 Live'], ['volunteers', '👥 Volunteers'], ['callouts', '📋 Call-Outs'], ['create', '➕ Add Volunteer']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setSelectedVolunteer(null) }} style={{
              padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              background: tab === key ? 'var(--accent)' : 'var(--surface)',
              color: tab === key ? '#0a0f0a' : 'var(--muted)',
              border: tab === key ? 'none' : '1px solid var(--border)',
            }}>{label}</button>
          ))}
        </div>

        {/* Live Tab */}
        {tab === 'dashboard' && (
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
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Since {formatTime(s.clock_in)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Volunteers List */}
        {tab === 'volunteers' && !selectedVolunteer && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>All Volunteers <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— click a name to view or edit</span></h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {volunteers.filter(v => v.role === 'volunteer').map(v => (
                <div key={v.id}
                  onClick={() => openVolunteer(v)}
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
                    <span style={{ color: 'var(--muted)', fontSize: '1rem' }}>›</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Volunteer Detail / Edit */}
        {tab === 'volunteers' && selectedVolunteer && (
          <div style={card}>
            <button onClick={() => setSelectedVolunteer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '1.25rem', padding: 0, fontFamily: 'DM Sans, sans-serif' }}>
              ← Back to volunteers
            </button>

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
              }}>
                {editing ? 'Cancel' : '✏️ Edit'}
              </button>
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
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="xxx-xxx-xxxx" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Affiliation</label>
                    <select value={editForm.affiliation} onChange={e => setEditForm({ ...editForm, affiliation: e.target.value })} style={inputStyle}>
                      <option value="">— Select —</option>
                      <option value="missionary">Missionary</option>
                      <option value="student">Student</option>
                      <option value="volunteer">Volunteer</option>
                      <option value="provider">Provider</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Parking Pass (1–100)</label>
                    <input type="number" min="1" max="100" value={editForm.parking_pass} onChange={e => setEditForm({ ...editForm, parking_pass: e.target.value })} style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Languages Spoken</label>
                    <input value={editForm.languages} onChange={e => setEditForm({ ...editForm, languages: e.target.value })} placeholder="e.g. Spanish, Mandarin, French" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} style={inputStyle}>
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

        {/* Call-outs Tab */}
        {tab === 'callouts' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Recent Call-Outs</h2>
            {callouts.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No call-outs submitted.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {callouts.map(c => (
                  <div key={c.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 500 }}>{c.profiles?.full_name}</span>
                      <span style={{ color: 'var(--warn)', fontFamily: 'DM Mono, monospace', fontSize: '0.85rem' }}>{formatDate(c.callout_date)}</span>
                    </div>
                    {c.reason && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{c.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Volunteer Tab */}
        {tab === 'create' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Create Volunteer Account</h2>
            <form onSubmit={handleCreateVolunteer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Jane Smith" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="jane@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Temporary Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Min 6 characters" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="xxx-xxx-xxxx" style={inputStyle} />
                </div>
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
                <div>
                  <label style={labelStyle}>Parking Pass (1–100)</label>
                  <input type="number" min="1" max="100" value={newParking} onChange={e => setNewParking(e.target.value)} placeholder="e.g. 42" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Languages Spoken</label>
                  <input value={newLanguages} onChange={e => setNewLanguages(e.target.value)} placeholder="e.g. Spanish, Mandarin, French" style={inputStyle} />
                </div>
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