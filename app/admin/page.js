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

function getMountainNow() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })
  return new Date(str)
}

function getMountainLabel() {
  const now = new Date()
  const mtnStr = now.toLocaleString('en-US', { timeZone: 'America/Denver' })
  const mtnDate = new Date(mtnStr)
  const mtnOffset = (now - mtnDate) / 60000
  return (mtnOffset <= 360) ? 'MDT' : 'MST'
}

function getCurrentDayAndShift() {
  const now = getMountainNow()
  const dayIndex = now.getDay()
  if (dayIndex === 0 || dayIndex === 6) return { day: null, shift: null, isShiftTime: false }
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayIndex]
  const timeDecimal = now.getHours() + now.getMinutes() / 60
  let shift = null
  if (timeDecimal >= 10 && timeDecimal < 14) shift = '10-2'
  else if (timeDecimal >= 14 && timeDecimal < 18) shift = '2-6'
  return { day: dayName, shift, isShiftTime: !!shift }
}

// Ensure Supabase timestamps (which may lack 'Z') are always parsed as UTC
function asUTC(ts) {
  if (!ts) return null
  // If it already has a timezone indicator, use as-is; otherwise append Z
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}

function formatMountain(ts) {
  if (!ts) return '—'
  return asUTC(ts).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })
}

function formatDateMountain(ts) {
  if (!ts) return '—'
  return asUTC(ts).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })
}

function formatDateTime(ts) {
  if (!ts) return '—'
  return asUTC(ts).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Convert a UTC ISO string to local datetime-local input value (Mountain)
// Convert a UTC ISO timestamp → "YYYY-MM-DDTHH:MM" in Mountain time for datetime-local inputs
function toMountainInputValue(ts) {
  if (!ts) return ''
  // Use Intl.DateTimeFormat parts to reliably extract Mountain time components
  const d = asUTC(ts)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = type => parts.find(p => p.type === type).value
  // hour12:false can return '24' for midnight — clamp to '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

// Convert a "YYYY-MM-DDTHH:MM" Mountain time string back to UTC ISO
function fromMountainInputValue(val) {
  if (!val) return null
  // Build an unambiguous Mountain time string and let Intl resolve the UTC offset
  // by asking what UTC time corresponds to this Mountain wall-clock time.
  // We do this by formatting a candidate UTC date in Mountain and binary-searching
  // for the one that matches — but the simple approach below is accurate to ±1min:
  const [datePart, timePart] = val.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  // Construct a UTC candidate assuming Mountain is UTC-7 (MDT), then correct
  const candidate = new Date(Date.UTC(year, month - 1, day, hour + 7, minute))
  // Check what Mountain wall-clock that candidate actually is
  const check = toMountainInputValue(candidate.toISOString())
  if (check === val) return candidate.toISOString()
  // If off (we're in MST = UTC-7 vs MDT = UTC-6), adjust by the difference
  const checkDate = new Date(check.replace('T', ' ') + ':00')
  const inputDate = new Date(val.replace('T', ' ') + ':00')
  const diffMs = inputDate - checkDate
  return new Date(candidate.getTime() - diffMs).toISOString()
}

export default function AdminPage() {
  const [profile, setProfile] = useState(null)
  const [volunteers, setVolunteers] = useState([])
  const [activeShifts, setActiveShifts] = useState([])
  const [callouts, setCallouts] = useState([])
  const [schedule, setSchedule] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
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
  const [showInactive, setShowInactive] = useState(false)
  const [statusForm, setStatusForm] = useState({ status: 'active', status_reason: '' })
  const [changingStatus, setChangingStatus] = useState(false)
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
  const [newSmaName, setNewSmaName] = useState('')
  const [newSmaContact, setNewSmaContact] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [creating, setCreating] = useState(false)

  // Messaging
  const [adminMessages, setAdminMessages] = useState([])
  const [msgBody, setMsgBody] = useState('')
  const [msgRecipientType, setMsgRecipientType] = useState('everyone')
  const [msgRecipientShift, setMsgRecipientShift] = useState('10-2')
  const [msgRecipientDay, setMsgRecipientDay] = useState('monday')
  const [msgRecipientRole, setMsgRecipientRole] = useState('Clinical Staff')
  const [msgRecipientVolId, setMsgRecipientVolId] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [msgView, setMsgView] = useState('inbox')

  // Hours submissions tab
  const [hoursSubmissions, setHoursSubmissions] = useState([])
  const [hoursLoading, setHoursLoading] = useState(false)
  const [approvingHoursId, setApprovingHoursId] = useState(null)

  // Shifts tab
  const [allShifts, setAllShifts] = useState([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [editingShiftId, setEditingShiftId] = useState(null)
  const [shiftEditForm, setShiftEditForm] = useState({})
  const [savingShift, setSavingShift] = useState(false)
  const [showNewShiftForm, setShowNewShiftForm] = useState(false)
  const [newShiftForm, setNewShiftForm] = useState({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
  const [creatingShift, setCreatingShift] = useState(false)
  const [shiftFilterVolId, setShiftFilterVolId] = useState('')

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
    await Promise.all([loadVolunteers(), loadActiveShifts(), loadCallouts(), loadSchedule(), loadAdminMessages()])
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

  async function loadAdminMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setAdminMessages(data || [])
  }

  async function loadAllShifts() {
    setShiftsLoading(true)
    const query = supabase
      .from('shifts')
      .select('*, profiles(id, full_name)')
      .order('clock_in', { ascending: false })
      .limit(200)
    const { data } = await query
    setAllShifts(data || [])
    setShiftsLoading(false)
  }

  async function handleShiftEditSave(shiftId) {
    setSavingShift(true)
    const clockIn = fromMountainInputValue(shiftEditForm.clock_in)
    const clockOut = shiftEditForm.clock_out ? fromMountainInputValue(shiftEditForm.clock_out) : null
    const { error } = await supabase
      .from('shifts')
      .update({ clock_in: clockIn, clock_out: clockOut, role: shiftEditForm.role || null })
      .eq('id', shiftId)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Shift updated!', 'success')
      setEditingShiftId(null)
      await loadAllShifts()
      await loadActiveShifts()
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
      await loadActiveShifts()
    }
  }

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
    // Build clock_in at 9:00 AM Mountain on work_date, clock_out = clock_in + hours
    const [year, month, day] = sub.work_date.split('-').map(Number)
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
      await loadActiveShifts()
      await loadVolunteers()
    }
    setCreatingShift(false)
  }

  async function handleAdminSendMessage(e) {
    e.preventDefault()
    if (!msgBody.trim()) return
    setSendingMsg(true)
    const payload = {
      sender_id: profile.id,
      recipient_type: msgRecipientType,
      body: msgBody.trim(),
      recipient_shift: msgRecipientType === 'shift' ? msgRecipientShift : null,
      recipient_day: msgRecipientType === 'shift' ? msgRecipientDay : null,
      recipient_role: msgRecipientType === 'role' ? msgRecipientRole : msgRecipientType === 'affiliation_missionary' ? 'missionary' : null,
      recipient_volunteer_id: msgRecipientType === 'volunteer' ? msgRecipientVolId : null,
    }
    const { error } = await supabase.from('messages').insert(payload)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Message sent!', 'success')
      setMsgBody('')
      setMsgView('inbox')
      await loadAdminMessages()
    }
    setSendingMsg(false)
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
      sma_name: v.sma_name||'', sma_contact: v.sma_contact||'', school: v.school||'',
      default_role: v.default_role||'',
    })
    setStatusForm({ status: v.status || 'active', status_reason: v.status_reason || '' })
    setEditing(false)
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
    const { data: fresh } = await supabase
      .from('profiles').select('*, shifts(*)').eq('id', selectedVolunteer.id).single()
    showMessage(isDeactivating ? 'Volunteer deactivated.' : 'Volunteer reactivated!', 'success')
    setSelectedVolunteer(fresh)
    await loadVolunteers()
    setChangingStatus(false)
  }

  async function handleSaveEdit() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name, phone: editForm.phone,
      affiliation: editForm.affiliation || null,
      parking_pass: editForm.parking_pass ? parseInt(editForm.parking_pass) : null,
      languages: editForm.languages, role: editForm.role,
      sma_name: editForm.affiliation === 'missionary' ? (editForm.sma_name||null) : null,
      sma_contact: editForm.affiliation === 'missionary' ? (editForm.sma_contact||null) : null,
      school: editForm.affiliation === 'student' ? (editForm.school||null) : null,
      default_role: editForm.default_role || null,
    }).eq('id', selectedVolunteer.id)
    if (error) { showMessage(error.message, 'error'); setSaving(false); return }
    const { data: fresh } = await supabase
      .from('profiles').select('*, shifts(*)').eq('id', selectedVolunteer.id).single()
    showMessage('Profile updated!', 'success')
    setEditing(false)
    setSelectedVolunteer(fresh)
    await loadVolunteers()
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
      sma_name: newAffiliation === 'missionary' ? (newSmaName||null) : null,
      sma_contact: newAffiliation === 'missionary' ? (newSmaContact||null) : null,
      school: newAffiliation === 'student' ? (newSchool||null) : null,
    })
    if (pe) showMessage(pe.message, 'error')
    else {
      showMessage(`Account created for ${newName}!`, 'success')
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('volunteer')
      setNewAffiliation(''); setNewParking(''); setNewPhone(''); setNewLanguages('')
      setNewSmaName(''); setNewSmaContact(''); setNewSchool('')
      loadVolunteers()
    }
    setCreating(false)
  }

  function totalHours(shifts) {
    return shifts?.reduce((acc, s) => {
      if (!s.clock_out) return acc
      return acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000
    }, 0).toFixed(1) || '0.0'
  }

  function calcShiftHours(clock_in, clock_out) {
    if (!clock_out) return null
    return ((asUTC(clock_out) - asUTC(clock_in)) / 3600000).toFixed(1)
  }

  function showMessage(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  function recipientLabel(msg) {
    if (msg.recipient_type === 'everyone') return 'Everyone'
    if (msg.recipient_type === 'admin') return 'Admins'
    if (msg.recipient_type === 'volunteer') {
      const v = volunteers.find(v => v.id === msg.recipient_volunteer_id)
      return `${v?.full_name || 'Volunteer'}`
    }
    if (msg.recipient_type === 'shift') {
      const day = msg.recipient_day ? msg.recipient_day.charAt(0).toUpperCase() + msg.recipient_day.slice(1, 3) : ''
      return `${day} ${msg.recipient_shift}`
    }
    if (msg.recipient_type === 'affiliation_missionary') return 'Missionaries'
    if (msg.recipient_type === 'role') return `${msg.recipient_role}`
    return msg.recipient_type
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
  const pillBtn = (active, mono) => ({
    padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
    fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif',
    background: active ? (mono ? '#1e40af' : 'var(--accent)') : 'var(--surface)',
    color: active ? (mono ? '#bfdbfe' : '#0a0f0a') : 'var(--muted)',
    border: active ? 'none' : '1px solid var(--border)',
  })

  // const { missing, day: currentDay, shift: currentShift, isShiftTime } = getMissingVolunteers()
  const unreadCallouts = callouts.filter(c => !c.is_read)
  const readCallouts = callouts.filter(c => c.is_read)
  const tzLabel = getMountainLabel()
  const volunteerList = volunteers
    .filter(v => v.role === 'volunteer' && (showInactive ? true : (v.status || 'active') === 'active'))
    .sort((a, b) => {
      const lastName = n => (n?.full_name?.split(' ').slice(-1)[0] || '').toLowerCase()
      return lastName(a).localeCompare(lastName(b))
    })
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const messages24h = adminMessages.filter(m => m.created_at >= cutoff24h && m.sender_id !== profile?.id).length

  const dayShiftCombos = DAYS.flatMap(d => SHIFTS.map(s => ({ day: d, shift: s, label: `${d.charAt(0).toUpperCase() + d.slice(1,3)} ${s}` })))

  const filteredShifts = shiftFilterVolId
    ? allShifts.filter(s => s.volunteer_id === shiftFilterVolId)
    : allShifts

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Admin Dashboard</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Bingham Family Clinic &nbsp;·&nbsp;
              <span style={{ fontFamily: 'DM Mono, monospace' }}>
                {currentTime.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })} {tzLabel}
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
            { label: 'Messages (24h)', value: messages24h, info: messages24h > 0 },
            { label: 'Clocked In Now', value: activeShifts.length, accent: true },
            { label: 'Unread Call-Outs', value: unreadCallouts.length, warn: unreadCallouts.length > 0 },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', borderColor: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : s.info ? '#60a5fa' : 'var(--border)' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : s.info ? '#60a5fa' : 'var(--text)' }}>{s.value}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            ['dashboard','Live'],
            ['schedule','Schedule'],
            ['volunteers','Volunteers'],
            ['shifts','Shifts'],
            ['callouts','Call-Outs'],
            ['messages','Messages'],
            ['hours','⏱ Hours'],
            ['create','➕ Add Volunteer'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => {
              setTab(key)
              setSelectedVolunteer(null)
              setAddingRole(null)
              if (key === 'shifts' && allShifts.length === 0) loadAllShifts()
              if (key === 'hours') loadHoursSubmissions()
            }} style={{
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
{/* Missing volunteer / shift presence block commented out */}
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
            {(() => {
              const todayMtn = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) // YYYY-MM-DD
              const todaysCallouts = unreadCallouts.filter(c => c.callout_date === todayMtn)
              return todaysCallouts.length > 0 && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📋 Today's Call-Outs</span>
                  <span style={{ padding: '0.15rem 0.55rem', background: 'rgba(251,191,36,0.15)', color: 'var(--warn)', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(251,191,36,0.3)' }}>
                    {todaysCallouts.length}
                  </span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {todaysCallouts.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: 'rgba(251,191,36,0.05)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.25)', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.profiles?.full_name}</span>
                        {c.shift_time && (
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', background: 'rgba(251,191,36,0.15)', color: 'var(--warn)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(251,191,36,0.3)' }}>
                            {c.day_of_week ? c.day_of_week.charAt(0).toUpperCase() + c.day_of_week.slice(1,3) + ' ' : ''}{c.shift_time}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {c.reason && <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>{c.reason}</span>}
                        <button onClick={() => markCalloutRead(c.id, true)} style={{ padding: '0.2rem 0.6rem', background: 'rgba(74,222,128,0.1)', color: 'var(--accent)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
                          ✓ Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )})()}
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => { setScheduleDay(d); setAddingRole(null) }} style={{ ...pillBtn(scheduleDay === d, false), textTransform: 'capitalize' }}>{d.slice(0,3)}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {SHIFTS.map(sh => (
                  <button key={sh} onClick={() => { setScheduleShift(sh); setAddingRole(null) }} style={pillBtn(scheduleShift === sh, true)}>{sh}</button>
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
                        {entries.map(entry => (
                          <div key={entry.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.3rem 0.6rem 0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.85rem',
                            background: 'rgba(74,222,128,0.08)',
                            border: '1px solid rgba(74,222,128,0.35)',
                            color: 'var(--text)',
                          }}>
                            <span>{entry.profiles?.full_name}</span>
                            <button onClick={() => handleRemoveEntry(entry.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {isOpen && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select value={addVolId} onChange={e => setAddVolId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                          <option value="">— Select volunteer —</option>
                          {volunteerList.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                        </select>
                        <button onClick={handleAddEntry} disabled={!addVolId || addingEntry} style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
                          {addingEntry ? '...' : 'Assign'}
                        </button>
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
              }}>{editing ? 'Cancel' : 'Edit'}</button>
            </div>
            {!editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {[
                    { label: 'Phone', value: selectedVolunteer.phone },
                    { label: 'Affiliation', value: selectedVolunteer.affiliation },
                    { label: 'Parking Pass', value: selectedVolunteer.parking_pass },
                    { label: 'Languages', value: selectedVolunteer.languages },
                    { label: 'Total Hours', value: totalHours(selectedVolunteer.shifts) + 'h' },
                    { label: 'Role', value: selectedVolunteer.role },
                    { label: 'Default Position', value: selectedVolunteer.default_role },
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
                {(() => {
                  const isInactive = (selectedVolunteer.status || 'active') === 'inactive'
                  return (
                    <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: `1px solid ${isInactive ? 'rgba(156,163,175,0.4)' : 'rgba(74,222,128,0.3)'}`, background: isInactive ? 'rgba(156,163,175,0.06)' : 'rgba(74,222,128,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Status</p>
                          <p style={{ fontWeight: 600, color: isInactive ? 'var(--muted)' : 'var(--accent)' }}>
                            {isInactive ? '⊘ Inactive' : '● Active'}
                          </p>
                          {isInactive && selectedVolunteer.status_reason && (
                            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                              Reason: {selectedVolunteer.status_reason}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '200px' }}>
                          {!isInactive && (
                            <select
                              value={statusForm.status_reason}
                              onChange={e => setStatusForm({ ...statusForm, status_reason: e.target.value })}
                              style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                            >
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
                  )
                })()}
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
                  <div>
                    <label style={labelStyle}>Default Position</label>
                    <select value={editForm.default_role} onChange={e => setEditForm({...editForm, default_role: e.target.value})} style={inputStyle}>
                      <option value="">— None —</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
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
        )}

        {/* SHIFTS TAB */}
        {tab === 'shifts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* New Entry Form */}
            {showNewShiftForm && (
              <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(74,222,128,0.04)' }}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>New Shift Entry</h2>
                <form onSubmit={handleCreateShift} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Volunteer</label>
                    <select
                      value={newShiftForm.volunteer_id}
                      onChange={e => setNewShiftForm({ ...newShiftForm, volunteer_id: e.target.value })}
                      required
                      style={inputStyle}
                    >
                      <option value="">— Select volunteer —</option>
                      {volunteers.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Clock In ({tzLabel})</label>
                      <input
                        type="datetime-local"
                        value={newShiftForm.clock_in}
                        onChange={e => setNewShiftForm({ ...newShiftForm, clock_in: e.target.value })}
                        required
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Clock Out ({tzLabel}) <span style={{ color: 'var(--muted)', textTransform: 'none', fontSize: '0.75rem' }}>— leave blank if active</span></label>
                      <input
                        type="datetime-local"
                        value={newShiftForm.clock_out}
                        onChange={e => setNewShiftForm({ ...newShiftForm, clock_out: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Position</label>
                    <select
                      value={newShiftForm.role}
                      onChange={e => setNewShiftForm({ ...newShiftForm, role: e.target.value })}
                      style={inputStyle}
                    >
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

            {/* List header */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h2 style={{ fontWeight: 600 }}>
                  All Shift Entries
                  <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— last 200</span>
                </h2>
                <button
                  onClick={() => { setShowNewShiftForm(true); setEditingShiftId(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'rgba(74,222,128,0.15)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}
                >
                  + New Entry
                </button>
              </div>

              {/* Filter by volunteer */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Filter by volunteer</label>
                <select
                  value={shiftFilterVolId}
                  onChange={e => setShiftFilterVolId(e.target.value)}
                  style={{ ...inputStyle, maxWidth: '320px' }}
                >
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
                      <div key={s.id} style={{
                        padding: '0.85rem 1rem',
                        background: 'var(--bg)',
                        borderRadius: '10px',
                        border: `1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'}`,
                        transition: 'border-color 0.15s',
                      }}>
                        {!isEditing ? (
                          /* READ VIEW */
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
                              {s.role ? (
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.role}</span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', fontStyle: 'italic' }}>no role</span>
                              )}
                              {hours !== null ? (
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>{hours}h</span>
                              ) : (
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(74,222,128,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(74,222,128,0.3)' }}>active</span>
                              )}
                              <button
                                onClick={() => {
                                  setEditingShiftId(s.id)
                                  setShiftEditForm({
                                    clock_in: toMountainInputValue(s.clock_in),
                                    clock_out: toMountainInputValue(s.clock_out),
                                    role: s.role || '',
                                  })
                                }}
                                style={{ padding: '0.3rem 0.7rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleShiftDelete(s.id)}
                                style={{ padding: '0.3rem 0.7rem', background: 'rgba(248,113,113,0.08)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* EDIT VIEW */
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--accent)' }}>
                              Editing: {s.profiles?.full_name}
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                              <div>
                                <label style={labelStyle}>Clock In ({tzLabel})</label>
                                <input
                                  type="datetime-local"
                                  value={shiftEditForm.clock_in}
                                  onChange={e => setShiftEditForm({ ...shiftEditForm, clock_in: e.target.value })}
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label style={labelStyle}>Clock Out ({tzLabel}) <span style={{ color: 'var(--muted)', textTransform: 'none', fontSize: '0.75rem' }}>— clear to mark active</span></label>
                                <input
                                  type="datetime-local"
                                  value={shiftEditForm.clock_out}
                                  onChange={e => setShiftEditForm({ ...shiftEditForm, clock_out: e.target.value })}
                                  style={inputStyle}
                                />
                              </div>
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={labelStyle}>Position</label>
                              <select
                                value={shiftEditForm.role}
                                onChange={e => setShiftEditForm({ ...shiftEditForm, role: e.target.value })}
                                style={inputStyle}
                              >
                                <option value="">— No role —</option>
                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleShiftEditSave(s.id)}
                                disabled={savingShift}
                                style={{ padding: '0.55rem 1.1rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: savingShift ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}
                              >
                                {savingShift ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingShiftId(null)}
                                style={{ padding: '0.55rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}
                              >
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
                          {c.shift_time && <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{c.day_of_week} {c.shift_time}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ color: 'var(--warn)', fontFamily: 'DM Mono, monospace', fontSize: '0.85rem' }}>{formatDateMountain(c.callout_date)}</span>
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
                            {c.shift_time && <span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{c.day_of_week} {c.shift_time}</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ color: 'var(--muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.85rem' }}>{formatDateMountain(c.callout_date)}</span>
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

        {/* HOURS SUBMISSIONS TAB */}
        {tab === 'hours' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {hoursLoading ? (
              <p style={{ color: 'var(--muted)', padding: '1rem' }}>Loading...</p>
            ) : hoursSubmissions.length === 0 ? (
              <div style={card}>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No hours submissions yet.</p>
              </div>
            ) : (
              <>
                {/* Pending first */}
                {hoursSubmissions.filter(h => h.status === 'pending').length > 0 && (
                  <div style={card}>
                    <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>
                      Pending Approval
                      <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.55rem', background: 'rgba(251,191,36,0.15)', color: 'var(--warn)', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(251,191,36,0.3)' }}>
                        {hoursSubmissions.filter(h => h.status === 'pending').length}
                      </span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {hoursSubmissions.filter(h => h.status === 'pending').map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.75rem' }}>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{h.profiles?.full_name}</p>
                            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{h.work_date} &nbsp;·&nbsp; {h.role} &nbsp;·&nbsp; <span style={{ fontFamily: 'DM Mono, monospace' }}>{h.hours}h</span></p>
                            {h.notes && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>{h.notes}</p>}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={() => approveHours(h)}
                              disabled={approvingHoursId === h.id}
                              style={{ padding: '0.4rem 0.9rem', background: 'rgba(74,222,128,0.12)', color: 'var(--accent)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                              {approvingHoursId === h.id ? '...' : '✓ Approve'}
                            </button>
                            <button
                              onClick={() => rejectHours(h.id)}
                              disabled={approvingHoursId === h.id}
                              style={{ padding: '0.4rem 0.9rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Reviewed submissions */}
                {hoursSubmissions.filter(h => h.status !== 'pending').length > 0 && (
                  <div style={card}>
                    <h2 style={{ fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)' }}>Previously Reviewed</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {hoursSubmissions.filter(h => h.status !== 'pending').map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', opacity: 0.75 }}>
                          <div>
                            <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{h.profiles?.full_name}</span>
                            <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{h.work_date} · {h.role} · {h.hours}h</span>
                          </div>
                          <span style={{
                            fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 500,
                            background: h.status === 'approved' ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.1)',
                            color: h.status === 'approved' ? 'var(--accent)' : '#ef4444',
                            border: `1px solid ${h.status === 'approved' ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.25)'}`,
                          }}>{h.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {tab === 'messages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[['inbox','📥 Inbox'],['sent','📤 Sent'],['compose','✏️ Compose']].map(([key, label]) => (
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
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>All Messages</h2>
                {adminMessages.filter(m => m.sender_id !== profile?.id).length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No messages yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {adminMessages.filter(m => m.sender_id !== profile?.id).map(m => (
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
                {adminMessages.filter(m => m.sender_id === profile?.id).length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No sent messages yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {adminMessages.filter(m => m.sender_id === profile?.id).map(m => (
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
                <form onSubmit={handleAdminSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Send to</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[
                        { value: 'everyone', label: 'Everyone' },
                        { value: 'affiliation_missionary', label: 'Missionaries' },
                        { value: 'admin', label: 'Admins' },
                        { value: 'shift', label: 'Shift' },
                        { value: 'role', label: 'Role' },
                        { value: 'volunteer', label: 'Individual' },
                      ].map(opt => (
                        <button key={opt.value} type="button" onClick={() => setMsgRecipientType(opt.value)} style={{
                          padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500,
                          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                          background: msgRecipientType === opt.value ? 'var(--accent)' : 'var(--surface)',
                          color: msgRecipientType === opt.value ? '#0a0f0a' : 'var(--muted)',
                          border: msgRecipientType === opt.value ? 'none' : '1px solid var(--border)',
                        }}>{opt.label}</button>
                      ))}
                    </div>

                    {msgRecipientType === 'shift' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which shift</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {dayShiftCombos.map(({ day, shift, label }) => {
                            const active = msgRecipientDay === day && msgRecipientShift === shift
                            return (
                              <button key={label} type="button"
                                onClick={() => { setMsgRecipientDay(day); setMsgRecipientShift(shift) }}
                                style={{
                                  padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500,
                                  cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                                  background: active ? '#1e40af' : 'var(--surface)',
                                  color: active ? '#bfdbfe' : 'var(--muted)',
                                  border: active ? 'none' : '1px solid var(--border)',
                                }}>{label}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {msgRecipientType === 'role' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which role</label>
                        <select value={msgRecipientRole} onChange={e => setMsgRecipientRole(e.target.value)} style={inputStyle}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    )}

                    {msgRecipientType === 'volunteer' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which volunteer</label>
                        <select value={msgRecipientVolId} onChange={e => setMsgRecipientVolId(e.target.value)} style={inputStyle}>
                          <option value="">— Select volunteer —</option>
                          {volunteers.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>Message</label>
                    <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} required rows={4} placeholder="Write your message..." style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <button type="submit"
                    disabled={sendingMsg || !msgBody.trim() || (msgRecipientType === 'volunteer' && !msgRecipientVolId)}
                    style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: sendingMsg ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {sendingMsg ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
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