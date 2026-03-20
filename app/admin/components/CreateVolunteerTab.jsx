'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ROLES } from '../../lib/constants'
import { card, inputStyle, labelStyle } from '../../lib/styles'

export default function CreateVolunteerTab({ onVolunteersChange, showMessage }) {
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('volunteer')
  const [newAffiliation, setNewAffiliation] = useState('')
  const [newCredentials, setNewCredentials] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newLanguages, setNewLanguages] = useState('')
  const [newSmaName, setNewSmaName] = useState('')
  const [newSmaContact, setNewSmaContact] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [newBirthday, setNewBirthday] = useState('')
  const [newDefaultRole, setNewDefaultRole] = useState('')
  const [creating, setCreating] = useState(false)

  function resetForm() {
    setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('volunteer')
    setNewAffiliation(''); setNewCredentials(''); setNewPhone(''); setNewLanguages('')
    setNewSmaName(''); setNewSmaContact(''); setNewSchool(''); setNewBirthday(''); setNewDefaultRole('')
  }

  async function handleCreateVolunteer(e) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await supabase.auth.signUp({ email: newEmail, password: newPassword })
    if (error) { showMessage(error.message, 'error'); setCreating(false); return }
    const { error: pe } = await supabase.from('profiles').insert({
      id: data.user.id, full_name: newName, email: newEmail, role: newRole,
      affiliation: newAffiliation||null, credentials: newCredentials || null,
      phone: newPhone||null, languages: newLanguages||null,
      sma_name: newAffiliation === 'missionary' ? (newSmaName||null) : null,
      sma_contact: newAffiliation === 'missionary' ? (newSmaContact||null) : null,
      school: newAffiliation === 'student' ? (newSchool||null) : null,
      birthday: newBirthday || null,
      default_role: newDefaultRole || null,
    })
    if (pe) showMessage(pe.message, 'error')
    else {
      showMessage(`Account created for ${newName}!`, 'success')
      resetForm()
      onVolunteersChange()
    }
    setCreating(false)
  }

  return (
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
          <div><label style={labelStyle}>Credentials / Skills</label><input type="text" value={newCredentials} onChange={e => setNewCredentials(e.target.value)} placeholder="e.g. EMT, Phlebotomy" style={inputStyle} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Languages Spoken</label><input value={newLanguages} onChange={e => setNewLanguages(e.target.value)} placeholder="e.g. Spanish, Mandarin" style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Role</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)} style={inputStyle}>
              <option value="volunteer">Volunteer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Default Position</label>
            <select value={newDefaultRole} onChange={e => setNewDefaultRole(e.target.value)} style={inputStyle}>
              <option value="">— None —</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Birthday</label>
            <input type="date" value={newBirthday} onChange={e => setNewBirthday(e.target.value)} style={inputStyle} />
          </div>
          {newAffiliation === 'missionary' && <>
            <div><label style={labelStyle}>SMA Name</label><input value={newSmaName} onChange={e => setNewSmaName(e.target.value)} placeholder="SMA full name" style={inputStyle} /></div>
            <div><label style={labelStyle}>SMA Contact</label><input value={newSmaContact} onChange={e => setNewSmaContact(e.target.value)} placeholder="Phone or email" style={inputStyle} /></div>
          </>}
          {newAffiliation === 'student' && <>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>School</label><input value={newSchool} onChange={e => setNewSchool(e.target.value)} placeholder="University or college name" style={inputStyle} /></div>
          </>}
        </div>
        <button type="submit" disabled={creating} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          {creating ? 'Creating...' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
