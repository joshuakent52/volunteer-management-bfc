'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

export const dynamic = 'force-dynamic'

const DAYS = ['monday','tuesday','wednesday','thursday','friday']
const SHIFTS = ['10-2','2-6']
const ROLES = [
  'Clinical Staff','Scribe','Receptionist','Lab','Pharmacy',
  'Clinical Supervisor','Patient Nav.','Mental Health','Support Center',
  'Young Support','Float','OSSM','Information Systems',
  'Credentialing','Media','Provider', 'Director'
]
const ROLE_SUGGESTIONS = {
  'Clinical Supervisor': 1, 'Credentialing': 1, 'Float': 1, 'Lab': 2,
  'Mental Health': 1, 'Patient Nav.': 2, 'Pharmacy': 2, 'Receptionist': 2,
  'Scribe': 3, 'Support Center': 2, 'Clinical Staff': 4,
}
const SCHOOLS = ['BYU', 'UVU', 'Norda', 'SLCC', 'U of U', 'Other']
const MAJORS = ['Pre-Med', 'Pre-Nursing', 'Pre-PA', 'Pre-Dental', 'Pre-Pharmacy', 'Pre-PT', 'Other Pre-Health', 'Biology', 'Chemistry', 'Biochemistry', 'Neuroscience', 'Public Health', 'Health Administration', 'Nutrition / Dietetics', 'Psychology', 'Social Work', 'Computer Science', 'Data Science','Biomedical Engineering', 'Other STEM', 'Business', 'Finance', 'Marketing', 'Management','English', 'Political Science', 'Sociology', 'Communications','Other']

const ACTION_LABELS = {
  approved_callout: 'Approved callout', denied_callout: 'Denied callout',
  approved_cover: 'Approved cover', denied_cover: 'Denied cover',
  approved_hours: 'Approved hours', rejected_hours: 'Rejected hours',
  deleted_shift: 'Deleted shift', edited_shift: 'Edited shift', created_shift: 'Created shift',
  edited_volunteer: 'Edited volunteer', deactivated_volunteer: 'Deactivated volunteer',
  reactivated_volunteer: 'Reactivated volunteer', assigned_schedule: 'Assigned to schedule',
  removed_schedule: 'Removed from schedule', sent_message: 'Sent message', created_volunteer: 'Created volunteer',
}
const ACTION_COLORS = {
  approved_callout: '#4ade80', denied_callout: '#ef4444', approved_cover: '#4ade80', denied_cover: '#ef4444',
  approved_hours: '#4ade80', rejected_hours: '#ef4444', deleted_shift: '#ef4444', edited_shift: '#60a5fa',
  created_shift: '#60a5fa', edited_volunteer: '#60a5fa', deactivated_volunteer: '#f87171',
  reactivated_volunteer: '#4ade80', assigned_schedule: '#a78bfa', removed_schedule: '#f87171',
  sent_message: '#94a3b8', created_volunteer: '#a78bfa',
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

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
function asUTC(ts) {
  if (!ts) return null
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}
function formatMountain(ts) { if (!ts) return '—'; return asUTC(ts).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' }) }
function formatDateTime(ts) { if (!ts) return '—'; return asUTC(ts).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function toMountainInputValue(ts) {
  if (!ts) return ''
  const d = asUTC(ts)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const get = type => parts.find(p => p.type === type).value
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}
function fromMountainInputValue(val) {
  if (!val) return null
  const [datePart, timePart] = val.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  let utcMs = Date.UTC(year, month - 1, day, hour + 7, minute)
  for (let i = 0; i < 4; i++) {
    const displayed = toMountainInputValue(new Date(utcMs).toISOString())
    if (displayed === val) break
    const [dDate, dTime] = displayed.split('T')
    const [dy, dm, dd] = dDate.split('-').map(Number)
    const [dh, dmin] = dTime.split(':').map(Number)
    utcMs += (Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(dy, dm - 1, dd, dh, dmin))
  }
  return new Date(utcMs).toISOString()
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

  const [scheduleDay, setScheduleDay] = useState('monday')
  const [scheduleShift, setScheduleShift] = useState('10-2')
  const [addingRole, setAddingRole] = useState(null)
  const [addVolId, setAddVolId] = useState('')
  const [addingEntry, setAddingEntry] = useState(false)
  const [addStartDate, setAddStartDate] = useState('')
  const [addEndDate, setAddEndDate] = useState('')
  const [addWeekPattern, setAddWeekPattern] = useState('every')
  const [addNotes, setAddNotes] = useState('')

  const [selectedVolunteer, setSelectedVolunteer] = useState(null)
  const [editing, setEditing] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [statusForm, setStatusForm] = useState({ status: 'active', status_reason: '' })
  const [changingStatus, setChangingStatus] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  const [newName, setNewName] = useState(''); const [newEmail, setNewEmail] = useState(''); const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('volunteer'); const [newAffiliation, setNewAffiliation] = useState(''); const [newCredentials, setNewCredentials] = useState('')
  const [newPhone, setNewPhone] = useState(''); const [newLanguages, setNewLanguages] = useState(''); const [newSmaName, setNewSmaName] = useState('')
  const [newSmaContact, setNewSmaContact] = useState(''); const [newSchool, setNewSchool] = useState(''); const [newMajor, setNewMajor] = useState('')
  const [newBirthday, setNewBirthday] = useState(''); const [newDefaultRole, setNewDefaultRole] = useState(''); const [creating, setCreating] = useState(false)

  const [adminMessages, setAdminMessages] = useState([])
  const [msgBody, setMsgBody] = useState('')
  const [msgRecipientType, setMsgRecipientType] = useState('everyone')
  const [msgRecipientShift, setMsgRecipientShift] = useState('10-2')
  const [msgRecipientDay, setMsgRecipientDay] = useState('monday')
  const [msgRecipientRole, setMsgRecipientRole] = useState('Clinical Staff')
  const [msgRecipientVolId, setMsgRecipientVolId] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [msgView, setMsgView] = useState('inbox')

  // Image attachment state
  const [msgImageFile, setMsgImageFile] = useState(null)
  const [msgImagePreview, setMsgImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef(null)

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState(null)

  const [coverRequests, setCoverRequests] = useState([])
  const [approvingCoverId, setApprovingCoverId] = useState(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [dateCoverShifts, setDateCoverShifts] = useState([])

  const [hoursSubmissions, setHoursSubmissions] = useState([])
  const [hoursLoading, setHoursLoading] = useState(false)
  const [approvingHoursId, setApprovingHoursId] = useState(null)

  const [allShifts, setAllShifts] = useState([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [editingShiftId, setEditingShiftId] = useState(null)
  const [shiftEditForm, setShiftEditForm] = useState({ clock_in: '', clock_out: '', role: '', clock_in_utc: '', clock_out_utc: '' })
  const [savingShift, setSavingShift] = useState(false)
  const [showNewShiftForm, setShowNewShiftForm] = useState(false)
  const [newShiftForm, setNewShiftForm] = useState({ volunteer_id: '', clock_in: '', clock_out: '', role: '' })
  const [creatingShift, setCreatingShift] = useState(false)
  const [shiftFilterVolId, setShiftFilterVolId] = useState('')

  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditFilterAdmin, setAuditFilterAdmin] = useState('')
  const [auditFilterAction, setAuditFilterAction] = useState('')
  const [auditFilterFrom, setAuditFilterFrom] = useState('')
  const [auditFilterTo, setAuditFilterTo] = useState('')

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
    await Promise.all([loadVolunteers(), loadActiveShifts(), loadCallouts(), loadSchedule(), loadAdminMessages(), loadCoverRequests()])
    setLoading(false)
  }

  async function loadVolunteers() { const { data } = await supabase.from('profiles').select('*, shifts(*)').order('full_name'); setVolunteers(data || []) }
  async function loadActiveShifts() { const { data } = await supabase.from('shifts').select('*, profiles(id, full_name)').is('clock_out', null); setActiveShifts(data || []) }
  async function loadCallouts() {
    const { data } = await supabase.from('callouts').select('*, volunteer:profiles!callouts_volunteer_id_fkey(full_name)').order('submitted_at', { ascending: false }).limit(100)
    setCallouts((data || []).map(c => ({ ...c, profiles: c.volunteer, status: c.status ?? (c.is_read ? 'approved' : 'pending') })))
  }
  async function loadSchedule() { const { data } = await supabase.from('schedule').select('*, profiles(id, full_name)').order('role'); setSchedule(data || []) }
  async function loadAdminMessages() {
    const { data } = await supabase.from('messages').select('*, sender:profiles!messages_sender_id_fkey(full_name)').order('created_at', { ascending: false }).limit(100)
    setAdminMessages(data || [])
  }
  async function loadCoverRequests() { const { data } = await supabase.from('shift_cover_requests').select('*, profiles(full_name)').order('requested_at', { ascending: false }); setCoverRequests(data || []) }
  async function loadDateCoverShifts(date) { const { data } = await supabase.from('shifts').select('*, profiles(id, full_name)').gte('clock_in', date + 'T00:00:00Z').lt('clock_in', date + 'T23:59:59Z'); setDateCoverShifts(data || []) }

  async function loadAuditLogs() {
    setAuditLoading(true)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    let query = supabase.from('audit_logs').select('*, admin:profiles!audit_logs_admin_id_fkey(full_name)').order('created_at', { ascending: false }).limit(500).gte('created_at', twoWeeksAgo)
    if (auditFilterAdmin) query = query.eq('admin_id', auditFilterAdmin)
    if (auditFilterAction) query = query.eq('action', auditFilterAction)
    if (auditFilterFrom) query = query.gte('created_at', auditFilterFrom + 'T00:00:00Z')
    if (auditFilterTo) query = query.lte('created_at', auditFilterTo + 'T23:59:59Z')
    const { data } = await query
    setAuditLogs(data || [])
    setAuditLoading(false)
  }

  async function audit(action, target_type, target_id, target_name, details) {
    try { await supabase.from('audit_logs').insert({ admin_id: profile.id, action, target_type, target_id: target_id ? String(target_id) : null, target_name: target_name || null, details: details || null }) } catch (e) { console.error('audit log failed:', e) }
  }

  // ── Image helpers ─────────────────────────────────────────────────────────

  function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) { showMessage('Image must be under 5 MB', 'error'); return }
    setMsgImageFile(file)
    setMsgImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setMsgImageFile(null)
    setMsgImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadImage(userId) {
    if (!msgImageFile) return null
    setUploadingImage(true)
    const ext = msgImageFile.name.split('.').pop()
    const path = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('message-images').upload(path, msgImageFile, { contentType: msgImageFile.type, upsert: false })
    setUploadingImage(false)
    if (error) { showMessage('Image upload failed: ' + error.message, 'error'); return null }
    const { data: { publicUrl } } = supabase.storage.from('message-images').getPublicUrl(path)
    return publicUrl
  }

  // ── Message sending ───────────────────────────────────────────────────────

  async function handleAdminSendMessage(e) {
    e.preventDefault()
    if (!msgBody.trim() && !msgImageFile) return
    setSendingMsg(true)

    const imageUrl = await uploadImage(profile.id)
    if (msgImageFile && !imageUrl) { setSendingMsg(false); return }

    const payload = {
      sender_id: profile.id,
      recipient_type: msgRecipientType,
      body: msgBody.trim(),
      image_url: imageUrl || null,
      recipient_shift: msgRecipientType === 'shift' ? msgRecipientShift : null,
      recipient_day: msgRecipientType === 'shift' ? msgRecipientDay : null,
      recipient_role: msgRecipientType === 'role' ? msgRecipientRole : msgRecipientType === 'affiliation_missionary' ? 'missionary' : null,
      recipient_volunteer_id: msgRecipientType === 'volunteer' ? msgRecipientVolId : null,
    }
    const { error } = await supabase.from('messages').insert(payload)
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Message sent!', 'success')
      await audit('sent_message', 'message', null, null, `To: ${msgRecipientType}`)
      setMsgBody('')
      clearImage()
      setMsgView('inbox')
      await loadAdminMessages()
    }
    setSendingMsg(false)
  }

  // ── All other handlers (unchanged from original) ──────────────────────────

  async function approveCallout(callout) {
    const { error } = await supabase.from('callouts').update({ status: 'approved', is_read: true }).eq('id', callout.id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Callout approved — shift is now open for coverage', 'success'); await audit('approved_callout', 'callout', callout.id, callout.profiles?.full_name, `${callout.callout_date} ${callout.shift_time}`); await loadCallouts() }
  }
  async function denyCallout(id) {
    const callout = callouts.find(c => c.id === id)
    const { error } = await supabase.from('callouts').update({ status: 'denied', is_read: true }).eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Callout denied.', 'success'); await audit('denied_callout', 'callout', id, callout?.profiles?.full_name, `${callout?.callout_date} ${callout?.shift_time}`); await loadCallouts() }
  }
  async function approveCover(req) {
    setApprovingCoverId(req.id)
    const callout = callouts.find(c => c.id === req.callout_id)
    if (!callout) { showMessage('Callout not found', 'error'); setApprovingCoverId(null); return }
    await supabase.from('callouts').update({ covered_by: req.volunteer_id }).eq('id', req.callout_id)
    await supabase.from('shift_cover_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', req.id)
    await supabase.from('shift_cover_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('callout_id', req.callout_id).neq('id', req.id)
    showMessage(`${req.profiles?.full_name} approved to cover shift!`, 'success')
    await audit('approved_cover', 'callout', req.callout_id, req.profiles?.full_name, `covering ${callout.callout_date} ${callout.shift_time}`)
    await loadCallouts(); await loadCoverRequests(); setApprovingCoverId(null)
  }
  async function denyCover(id) {
    setApprovingCoverId(id)
    const req = coverRequests.find(r => r.id === id)
    const { error } = await supabase.from('shift_cover_requests').update({ status: 'denied', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Cover request denied.', 'success'); await audit('denied_cover', 'callout', req?.callout_id, req?.profiles?.full_name); await loadCoverRequests() }
    setApprovingCoverId(null)
  }
  async function loadAllShifts() {
    setShiftsLoading(true)
    const { data } = await supabase.from('shifts').select('*, profiles(id, full_name)').order('clock_in', { ascending: false }).limit(200)
    setAllShifts(data || [])
    setShiftsLoading(false)
  }
  async function handleShiftEditSave(shiftId) {
    setSavingShift(true)
    const origClockIn = toMountainInputValue(shiftEditForm.clock_in_utc)
    const origClockOut = toMountainInputValue(shiftEditForm.clock_out_utc)
    const clockIn = shiftEditForm.clock_in !== origClockIn ? fromMountainInputValue(shiftEditForm.clock_in) : shiftEditForm.clock_in_utc
    const clockOut = shiftEditForm.clock_out ? (shiftEditForm.clock_out !== origClockOut ? fromMountainInputValue(shiftEditForm.clock_out) : shiftEditForm.clock_out_utc) : null
    const shift = allShifts.find(s => s.id === shiftId)
    const { error } = await supabase.from('shifts').update({ clock_in: clockIn, clock_out: clockOut, role: shiftEditForm.role || null }).eq('id', shiftId)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Shift updated!', 'success'); await audit('edited_shift', 'shift', shiftId, shift?.profiles?.full_name, `${formatDateTime(clockIn)} → ${clockOut ? formatDateTime(clockOut) : 'active'}`); setEditingShiftId(null); await loadAllShifts(); await loadActiveShifts() }
    setSavingShift(false)
  }
  async function handleShiftDelete(shiftId) {
    if (!confirm('Delete this shift entry? This cannot be undone.')) return
    const shift = allShifts.find(s => s.id === shiftId)
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Shift deleted.', 'success'); await audit('deleted_shift', 'shift', shiftId, shift?.profiles?.full_name, `${formatDateTime(shift?.clock_in)}`); await loadAllShifts(); await loadActiveShifts() }
  }
  async function loadHoursSubmissions() {
    setHoursLoading(true)
    const { data } = await supabase.from('hours_submissions').select('*, profiles(full_name, role)').order('submitted_at', { ascending: false }).limit(100)
    setHoursSubmissions(data || []); setHoursLoading(false)
  }
  async function approveHours(sub) {
    setApprovingHoursId(sub.id)
    const clockInUTC = fromMountainInputValue(`${sub.work_date}T09:00`)
    const clockOutUTC = new Date(new Date(clockInUTC).getTime() + sub.hours * 3600000).toISOString()
    const { error: shiftErr } = await supabase.from('shifts').insert({ volunteer_id: sub.volunteer_id, clock_in: clockInUTC, clock_out: clockOutUTC, role: sub.role })
    if (shiftErr) { showMessage(shiftErr.message, 'error'); setApprovingHoursId(null); return }
    await supabase.from('hours_submissions').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', sub.id)
    showMessage('Hours approved and shift created!', 'success')
    await audit('approved_hours', 'hours', sub.id, sub.profiles?.full_name, `${sub.hours}h on ${sub.work_date} (${sub.role})`)
    await loadHoursSubmissions(); setApprovingHoursId(null)
  }
  async function rejectHours(id) {
    setApprovingHoursId(id)
    const sub = hoursSubmissions.find(h => h.id === id)
    await supabase.from('hours_submissions').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
    showMessage('Submission rejected.', 'success')
    await audit('rejected_hours', 'hours', id, sub?.profiles?.full_name, `${sub?.hours}h on ${sub?.work_date}`)
    await loadHoursSubmissions(); setApprovingHoursId(null)
  }
  async function handleCreateShift(e) {
    e.preventDefault()
    if (!newShiftForm.volunteer_id || !newShiftForm.clock_in) return
    setCreatingShift(true)
    const clockIn = fromMountainInputValue(newShiftForm.clock_in)
    const clockOut = newShiftForm.clock_out ? fromMountainInputValue(newShiftForm.clock_out) : null
    const vol = volunteers.find(v => v.id === newShiftForm.volunteer_id)
    const { error } = await supabase.from('shifts').insert({ volunteer_id: newShiftForm.volunteer_id, clock_in: clockIn, clock_out: clockOut, role: newShiftForm.role || null })
    if (error) showMessage(error.message, 'error')
    else { showMessage('Shift entry created!', 'success'); await audit('created_shift', 'shift', null, vol?.full_name, `${formatDateTime(clockIn)}`); setNewShiftForm({ volunteer_id: '', clock_in: '', clock_out: '', role: '' }); setShowNewShiftForm(false); await loadAllShifts(); await loadActiveShifts(); await loadVolunteers() }
    setCreatingShift(false)
  }

  function openVolunteer(v) {
    setTab('volunteers'); setSelectedVolunteer(v)
    setEditForm({ full_name: v.full_name||'', email: v.email||'', phone: v.phone||'', affiliation: v.affiliation||'', credentials: v.credentials||'', languages: v.languages||'', role: v.role||'volunteer', sma_name: v.sma_name||'', sma_contact: v.sma_contact||'', school: v.school||'', default_role: v.default_role||'', birthday: v.birthday||'' })
    setStatusForm({ status: v.status || 'active', status_reason: v.status_reason || '' }); setEditing(false)
  }
  async function handleStatusChange(newStatus, reason) {
    setChangingStatus(true)
    const isDeactivating = newStatus === 'inactive'
    const { error } = await supabase.from('profiles').update({ status: newStatus, status_reason: isDeactivating ? (reason || null) : null, status_changed_at: new Date().toISOString() }).eq('id', selectedVolunteer.id)
    if (error) { showMessage(error.message, 'error'); setChangingStatus(false); return }
    const { data: fresh } = await supabase.from('profiles').select('*, shifts(*)').eq('id', selectedVolunteer.id).single()
    showMessage(isDeactivating ? 'Volunteer deactivated.' : 'Volunteer reactivated!', 'success')
    await audit(isDeactivating ? 'deactivated_volunteer' : 'reactivated_volunteer', 'volunteer', selectedVolunteer.id, selectedVolunteer.full_name, reason || null)
    setSelectedVolunteer(fresh); await loadVolunteers(); setChangingStatus(false)
  }
  async function handleSaveEdit() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: editForm.full_name, phone: editForm.phone, affiliation: editForm.affiliation || null, credentials: editForm.credentials || null, languages: editForm.languages, role: editForm.role, sma_name: editForm.affiliation === 'missionary' ? (editForm.sma_name||null) : null, sma_contact: editForm.affiliation === 'missionary' ? (editForm.sma_contact||null) : null, school: editForm.affiliation === 'student' ? (editForm.school||null) : null, major: editForm.affiliation === 'student' ? (editForm.major||null) : null, default_role: editForm.default_role || null, birthday: editForm.birthday || null }).eq('id', selectedVolunteer.id)
    if (error) { showMessage(error.message, 'error'); setSaving(false); return }
    const { data: fresh } = await supabase.from('profiles').select('*, shifts(*)').eq('id', selectedVolunteer.id).single()
    showMessage('Profile updated!', 'success'); await audit('edited_volunteer', 'volunteer', selectedVolunteer.id, selectedVolunteer.full_name)
    setEditing(false); setSelectedVolunteer(fresh); await loadVolunteers(); setSaving(false)
  }
  async function handleCreateVolunteer(e) {
    e.preventDefault(); setCreating(true)
    const { data, error } = await supabase.auth.signUp({ email: newEmail, password: newPassword })
    if (error) { showMessage(error.message, 'error'); setCreating(false); return }
    const { error: pe } = await supabase.from('profiles').insert({ id: data.user.id, full_name: newName, email: newEmail, role: newRole, affiliation: newAffiliation||null, credentials: newCredentials || null, phone: newPhone||null, languages: newLanguages||null, sma_name: newAffiliation === 'missionary' ? (newSmaName||null) : null, sma_contact: newAffiliation === 'missionary' ? (newSmaContact||null) : null, school: newAffiliation === 'student' ? (newSchool||null) : null, major: newAffiliation === 'student' ? (newMajor||null) : null, birthday: newBirthday || null, default_role: newDefaultRole || null })
    if (pe) showMessage(pe.message, 'error')
    else { showMessage(`Account created for ${newName}!`, 'success'); await audit('created_volunteer', 'volunteer', data.user.id, newName, newRole); setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('volunteer'); setNewAffiliation(''); setNewCredentials(''); setNewPhone(''); setNewLanguages(''); setNewSmaName(''); setNewSmaContact(''); setNewSchool(''); setNewMajor(''); setNewBirthday(''); setNewDefaultRole(''); loadVolunteers() }
    setCreating(false)
  }

  function totalHours(shifts) { return shifts?.reduce((acc, s) => { if (!s.clock_out) return acc; return acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000 }, 0).toFixed(1) || '0.0' }
  function calcShiftHours(clock_in, clock_out) { if (!clock_out) return null; return ((asUTC(clock_out) - asUTC(clock_in)) / 3600000).toFixed(1) }
  function showMessage(text, type) { setToast({ text, type }); setTimeout(() => setToast(null), 3500) }

  function recipientLabel(msg) {
    if (msg.recipient_type === 'everyone') return 'Everyone'
    if (msg.recipient_type === 'admin') return 'Admins'
    if (msg.recipient_type === 'volunteer') { const v = volunteers.find(v => v.id === msg.recipient_volunteer_id); return `${v?.full_name || 'Volunteer'}` }
    if (msg.recipient_type === 'shift') { const day = msg.recipient_day ? msg.recipient_day.charAt(0).toUpperCase() + msg.recipient_day.slice(1, 3) : ''; return `${day} ${msg.recipient_shift}` }
    if (msg.recipient_type === 'affiliation_missionary') return 'Missionaries'
    if (msg.recipient_type === 'role') return `${msg.recipient_role}`
    return msg.recipient_type
  }

  function getEntries(day, shift, role) {
    if (!scheduleDate) return schedule.filter(s => s.day_of_week === day && s.shift_time === shift && s.role === role)
    const d = new Date(scheduleDate + 'T12:00:00'); let count = 0; const target = d.getDay()
    const check = new Date(d.getFullYear(), d.getMonth(), 1)
    while (check <= d) { if (check.getDay() === target) count++; check.setDate(check.getDate() + 1) }
    return schedule.filter(s => {
      if (s.day_of_week !== day || s.shift_time !== shift || s.role !== role) return false
      if (s.start_date && s.start_date > scheduleDate) return false
      if (s.end_date   && s.end_date   < scheduleDate) return false
      if (s.week_pattern === 'odd'  && count % 2 !== 1) return false
      if (s.week_pattern === 'even' && count % 2 !== 0) return false
      return true
    })
  }

  async function handleAddEntry() {
    if (!addVolId) return; setAddingEntry(true)
    const currentEntries = getEntries(scheduleDay, scheduleShift, addingRole)
    const limit = ROLE_SUGGESTIONS[addingRole]
    if (limit && currentEntries.length >= limit) { showMessage(`Limit reached for ${addingRole} (${limit})`, 'error'); setAddingEntry(false); return }
    const exists = schedule.find(s => s.volunteer_id === addVolId && s.day_of_week === scheduleDay && s.shift_time === scheduleShift && s.role === addingRole)
    if (exists) { showMessage('Volunteer already assigned to this slot', 'error'); setAddingEntry(false); return }
    const vol = volunteers.find(v => v.id === addVolId)
    const { error } = await supabase.from('schedule').insert({ volunteer_id: addVolId, day_of_week: scheduleDay, shift_time: scheduleShift, role: addingRole, start_date: addStartDate || null, end_date: addEndDate || null, week_pattern: addWeekPattern || 'every', notes: addNotes || null })
    if (error) showMessage(error.message, 'error')
    else { showMessage('Volunteer assigned!', 'success'); await audit('assigned_schedule', 'schedule', null, vol?.full_name, `${scheduleDay} ${scheduleShift} — ${addingRole}`); setAddingRole(null); setAddVolId(''); setAddStartDate(''); setAddEndDate(''); setAddWeekPattern('every'); setAddNotes(''); await loadSchedule() }
    setAddingEntry(false)
  }
  async function handleRemoveEntry(id) {
    const entry = schedule.find(s => s.id === id)
    const { error } = await supabase.from('schedule').delete().eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Removed from schedule', 'success'); await audit('removed_schedule', 'schedule', id, entry?.profiles?.full_name, `${entry?.day_of_week} ${entry?.shift_time} — ${entry?.role}`); await loadSchedule() }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const affiliationColor = { missionary: '#818cf8', student: '#38bdf8', volunteer: '#02416B', provider: '#7dd3fc' }
  const badgeStyle = (color) => ({ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 500, background: color + '22', color: color, border: `1px solid ${color}55` })
  const pillBtn = (active, mono) => ({ padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif', background: active ? (mono ? '#1e40af' : 'var(--accent)') : 'var(--surface)', color: active ? (mono ? '#bfdbfe' : '#0a0f0a') : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' })

  const tzLabel = getMountainLabel()
  const volunteerList = volunteers.filter(v => v.role === 'volunteer' && (showInactive ? true : (v.status || 'active') === 'active')).sort((a, b) => { const ln = n => (n?.full_name?.split(' ').slice(-1)[0] || '').toLowerCase(); return ln(a).localeCompare(ln(b)) })
  const adminList = volunteers.filter(v => v.role === 'admin')
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const messages24h = adminMessages.filter(m => m.created_at >= cutoff24h && m.sender_id !== profile?.id).length
  const dayShiftCombos = DAYS.flatMap(d => SHIFTS.map(s => ({ day: d, shift: s, label: `${d.charAt(0).toUpperCase() + d.slice(1,3)} ${s}` })))
  const filteredShifts = shiftFilterVolId ? allShifts.filter(s => s.volunteer_id === shiftFilterVolId) : allShifts

  // ── Shared message card renderer ─────────────────────────────────────────
  function MessageCard({ m }) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.sender?.full_name || 'Unknown'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{recipientLabel(m)}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace' }}>{formatDateTime(m.created_at)}</span>
          </div>
        </div>
        {m.body && <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: m.image_url ? '0.75rem' : 0 }}>{m.body}</p>}
        {m.image_url && (
          <img
            src={m.image_url}
            alt="Attached image"
            onClick={() => setLightboxUrl(m.image_url)}
            style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '8px', objectFit: 'cover', cursor: 'zoom-in', border: '1px solid var(--border)', display: 'block', marginTop: m.body ? '0.5rem' : 0 }}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Admin Dashboard</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Bingham Family Clinic &nbsp;·&nbsp;<span style={{ fontFamily: 'DM Mono, monospace' }}>{currentTime.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })} {tzLabel}</span></p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Messages (24h)', value: messages24h, info: messages24h > 0 },
            { label: 'Clocked In Now', value: activeShifts.length, accent: true },
            { label: 'Pending Call-Outs', value: callouts.filter(c => !c.status || c.status === 'pending').length, warn: callouts.filter(c => !c.status || c.status === 'pending').length > 0 },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', borderColor: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : s.info ? '#60a5fa' : 'var(--border)' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : s.info ? '#60a5fa' : 'var(--text)' }}>{s.value}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[['dashboard','Live'],['schedule','Schedule'],['volunteers','Volunteers'],['shifts','Shifts'],['callouts','Call-Outs'],['messages','Messages'],['hours','Hours'],['audit','Recent Activity'],['create','Add Volunteer']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setSelectedVolunteer(null); setAddingRole(null); if (key === 'shifts' && allShifts.length === 0) loadAllShifts(); if (key === 'hours') loadHoursSubmissions(); if (key === 'audit') loadAuditLogs() }}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: tab === key ? 'var(--accent)' : 'var(--surface)', color: tab === key ? '#fff' : 'var(--muted)', border: tab === key ? 'none' : '1px solid var(--border)' }}>{label}</button>
          ))}
        </div>

        {/* LIVE TAB */}
        {tab === 'dashboard' && (() => {
          const todayMtnStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
          const mtnNow = getMountainNow()
          const dayIndex = mtnNow.getDay()
          const isWeekday = dayIndex >= 1 && dayIndex <= 5
          const h = mtnNow.getHours() + mtnNow.getMinutes() / 60
          const currentShift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
          const currentDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]

          const expectedVolunteers = isWeekday && currentShift ? (() => {
            const calledOutIds = new Set(
              callouts
                .filter(c => c.callout_date === todayMtnStr && c.shift_time === currentShift && c.status === 'approved')
                .map(c => c.volunteer_id)
            )
            const coverIds = new Set(
              callouts
                .filter(c => c.callout_date === todayMtnStr && c.shift_time === currentShift && c.covered_by)
                .map(c => c.covered_by)
            )
            const scheduled = schedule.filter(s =>
              s.day_of_week === currentDay &&
              s.shift_time === currentShift &&
              (!s.start_date || s.start_date <= todayMtnStr) &&
              (!s.end_date   || s.end_date   >= todayMtnStr)
            )
            const expectedIds = new Set([
              ...scheduled.filter(s => !calledOutIds.has(s.volunteer_id)).map(s => s.volunteer_id),
              ...coverIds,
            ])
            const clockedInIds = new Set(activeShifts.map(s => s.profiles?.id).filter(Boolean))
            return [...expectedIds]
              .filter(id => !clockedInIds.has(id))
              .map(id => {
                const vol = volunteers.find(v => v.id === id)
                const entry = scheduled.find(s => s.volunteer_id === id)
                if (!vol) return null
                return { ...vol, role: entry?.role || '—', notes: entry?.notes || null }
              })
              .filter(Boolean)
          })() : []

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {isWeekday && currentShift && (
                <div style={{ ...card, borderColor: expectedVolunteers.length > 0 ? 'var(--danger)' : 'rgba(2,65,107,0.4)', background: expectedVolunteers.length > 0 ? 'rgba(239,68,68,0.03)' : 'rgba(2,65,107,0.03)' }}>
                  <h2 style={{ fontWeight: 600, marginBottom: expectedVolunteers.length > 0 ? '1rem' : 0, fontSize: '1rem' }}>
                    {expectedVolunteers.length > 0
                      ? `${expectedVolunteers.length} volunteer${expectedVolunteers.length !== 1 ? 's' : ''} not yet clocked in — ${currentDay} ${currentShift}`
                      : `All expected volunteers clocked in — ${currentDay} ${currentShift}`}
                  </h2>
                  {expectedVolunteers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {expectedVolunteers.map(v => (
                        <div key={v.id} onClick={() => openVolunteer(v)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'}
                        >
                          <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{v.full_name}</span>
                          {v.notes && <span style={{ fontSize: '0.78rem', color: '#60a5fa', fontStyle: 'italic' }}>({v.notes})</span>}
                          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{v.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Currently Clocked In</h2>
                {activeShifts.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No one is currently clocked in.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {activeShifts.map(s => (
                      <div key={s.id} onClick={() => { const full = volunteers.find(v => v.id === s.profiles?.id); if (full) openVolunteer(full) }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(2,65,107,0.05)', borderRadius: '8px', border: '1px solid var(--accent)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
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
                const todayMtn = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                const todaysCallouts = callouts.filter(c => c.callout_date === todayMtn && c.status !== 'denied')
                return todaysCallouts.length > 0 && (
                  <div style={card}>
                    <h2 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>Today's Call-Outs</span>
                      <span style={{ padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>
                        {todaysCallouts.length}
                      </span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {todaysCallouts.map(c => {
                        const isCovered = c.status === 'approved' && c.covered_by
                        const isOpen    = c.status === 'approved' && !c.covered_by
                        const isPending = !c.status || c.status === 'pending'
                        return (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: isCovered ? 'rgba(2,65,107,0.04)' : isOpen ? 'rgba(239,68,68,0.04)' : 'rgba(96,165,250,0.05)', borderRadius: '8px', border: `1px solid ${isCovered ? 'rgba(2,65,107,0.25)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}`, flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.profiles?.full_name}</span>
                              {c.shift_time && (
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.3)' }}>
                                  {c.day_of_week ? c.day_of_week.charAt(0).toUpperCase() + c.day_of_week.slice(1,3) + ' ' : ''}{c.shift_time}
                                </span>
                              )}
                              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', fontWeight: 600,
                                background: isCovered ? 'rgba(2,65,107,0.1)' : isOpen ? 'rgba(239,68,68,0.08)' : 'rgba(96,165,250,0.1)',
                                color: isCovered ? 'var(--accent)' : isOpen ? '#ef4444' : '#60a5fa',
                                border: `1px solid ${isCovered ? 'rgba(2,65,107,0.3)' : isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.3)'}`,
                              }}>
                                {isCovered ? 'covered' : isOpen ? 'open' : 'pending'}
                              </span>
                              {c.reason && <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>{c.reason}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => { setScheduleDay(d); setAddingRole(null); setScheduleDate(''); setDateCoverShifts([]) }} style={{ ...pillBtn(scheduleDay === d, false), textTransform: 'capitalize' }}>{d.slice(0,3)}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {SHIFTS.map(sh => (
                  <button key={sh} onClick={() => { setScheduleShift(sh); setAddingRole(null); setScheduleDate(''); setDateCoverShifts([]) }} style={pillBtn(scheduleShift === sh, true)}>{sh}</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                <label style={{ ...labelStyle, margin: 0, whiteSpace: 'nowrap' }}>View date:</label>
                <input type="date" value={scheduleDate} onChange={e => {
                  const val = e.target.value
                  setScheduleDate(val)
                  if (val) {
                    loadDateCoverShifts(val)
                    const d = new Date(val + 'T12:00:00')
                    const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()]
                    if (dayName !== 'sunday' && dayName !== 'saturday') setScheduleDay(dayName)
                  } else {
                    setDateCoverShifts([])
                  }
                }} style={{ ...inputStyle, width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {ROLES.map(role => {
                const entries = getEntries(scheduleDay, scheduleShift, role)
                const isOpen = addingRole === role
                return (
                  <div key={role} style={{ ...card, padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: entries.length > 0 || isOpen ? '0.75rem' : 0 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {role}{ROLE_SUGGESTIONS[role] ? ` — ${ROLE_SUGGESTIONS[role]}` : ''}
                      </span>
                      <button onClick={() => { setAddingRole(isOpen ? null : role); setAddVolId('') }} style={{
                        padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        background: isOpen ? 'var(--surface)' : 'rgba(2,65,107,0.12)',
                        color: isOpen ? 'var(--muted)' : 'var(--accent)',
                        border: `1px solid ${isOpen ? 'var(--border)' : 'var(--accent)'}`,
                      }}>{isOpen ? 'Cancel' : '+ Assign'}</button>
                    </div>
                    {entries.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: isOpen ? '0.75rem' : 0 }}>
                        {entries.map(entry => {
                          const approvedCallout = callouts.find(c =>
                            c.volunteer_id === entry.volunteer_id &&
                            c.callout_date === scheduleDate &&
                            c.shift_time === scheduleShift &&
                            c.status === 'approved'
                          )
                          const coverShift = approvedCallout && dateCoverShifts.find(s =>
                            s.volunteer_id === approvedCallout.covered_by
                          )
                          const coverName = coverShift ? coverShift.profiles?.full_name : null
                          return (
                            <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.6rem 0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.85rem', background: approvedCallout ? 'rgba(96,165,250,0.08)' : 'rgba(2,65,107,0.08)', border: `1px solid ${approvedCallout ? 'rgba(96,165,250,0.4)' : 'rgba(2,65,107,0.35)'}`, color: approvedCallout ? 'var(--warn)' : 'var(--text)' }}>
                                {approvedCallout && <span style={{ fontSize: '0.7rem' }}>out</span>}
                                <span style={{ textDecoration: approvedCallout ? 'line-through' : 'none', opacity: approvedCallout ? 0.6 : 1 }}>{entry.profiles?.full_name}</span>
                                {entry.notes && <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontStyle: 'italic' }}>({entry.notes})</span>}
                                {entry.week_pattern && entry.week_pattern !== 'every' && (
                                  <span style={{ fontSize: '0.65rem', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>
                                    {entry.week_pattern === 'odd' ? '1st&3rd' : '2nd&4th'}
                                  </span>
                                )}
                                <button onClick={() => handleRemoveEntry(entry.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}>✕</button>
                              </div>
                              {coverName && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem 0.25rem 0.75rem', borderRadius: '100px', fontSize: '0.82rem', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.35)', color: '#60a5fa', marginLeft: '0.5rem' }}>
                                  <span style={{ fontSize: '0.7rem' }}>cover</span>
                                  <span>{coverName}</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {isOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <select value={addVolId} onChange={e => setAddVolId(e.target.value)} style={inputStyle}>
                          <option value="">— Select volunteer —</option>
                          {volunteerList.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {[
                            { value: 'every', label: 'Every week' },
                            { value: 'odd',   label: '1st & 3rd' },
                            { value: 'even',  label: '2nd & 4th' },
                          ].map(opt => (
                            <button key={opt.value} type="button" onClick={() => setAddWeekPattern(opt.value)}
                              style={{ ...pillBtn(addWeekPattern === opt.value, false), fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          <div>
                            <label style={labelStyle}>Start date <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(optional)</span></label>
                            <input type="date" value={addStartDate} onChange={e => setAddStartDate(e.target.value)} style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }} />
                          </div>
                          <div>
                            <label style={labelStyle}>End date <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(optional)</span></label>
                            <input type="date" value={addEndDate} onChange={e => setAddEndDate(e.target.value)} style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }} />
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>Schedule note <span style={{ textTransform: 'none', color: 'var(--muted)', fontSize: '0.72rem' }}>(optional)</span></label>
                          <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="e.g. arriving late" style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }} />
                        </div>
                        <button onClick={handleAddEntry} disabled={!addVolId || addingEntry}
                          style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
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
              <button onClick={() => setEditing(!editing)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: editing ? 'var(--surface)' : 'var(--accent)', color: editing ? 'var(--muted)' : '#0a0f0a', border: editing ? '1px solid var(--border)' : 'none' }}>{editing ? 'Cancel' : 'Edit'}</button>
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
                      { label: 'Major', value: selectedVolunteer.major },
                    ] : []),
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{label}</p>
                      <p style={{ fontWeight: 500, color: value ? 'var(--text)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</p>
                    </div>
                  ))}
                </div>
                {(() => {
                  const isInactive = (selectedVolunteer.status || 'active') === 'inactive'
                  return (
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
                            style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: (changingStatus || (!isInactive && !statusForm.status_reason)) ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', border: 'none', background: isInactive ? 'var(--accent)' : '#dc2626', color: isInactive ? '#0a0f0a' : '#fff', opacity: (!isInactive && !statusForm.status_reason) ? 0.5 : 1 }}>
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
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>School</label>
                      <select value={editForm.school} onChange={e => setEditForm({...editForm, school: e.target.value})} style={inputStyle}>
                        <option value="">— Select school —</option>
                        {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Major</label>
                      <select value={editForm.major || ''} onChange={e => setEditForm({...editForm, major: e.target.value})} style={inputStyle}>
                        <option value="">— Select major —</option>
                        {MAJORS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
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
            {showNewShiftForm && (
              <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)' }}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>New Shift Entry</h2>
                <form onSubmit={handleCreateShift} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Volunteer</label>
                    <select value={newShiftForm.volunteer_id} onChange={e => setNewShiftForm({ ...newShiftForm, volunteer_id: e.target.value })} required style={inputStyle}>
                      <option value="">— Select volunteer —</option>
                      {volunteerList.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
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
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h2 style={{ fontWeight: 600 }}>All Shift Entries <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— last 200</span></h2>
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
                      <div key={s.id} style={{ padding: '0.85rem 1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'}` }}>
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
                              {s.role ? (
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', fontWeight: 500 }}>{s.role}</span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', fontStyle: 'italic' }}>no role</span>
                              )}
                              {hours !== null ? (
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>{hours}h</span>
                              ) : (
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(2,65,107,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(2,65,107,0.35)' }}>active</span>
                              )}
                              <button
                                onClick={() => {
                                  setEditingShiftId(s.id)
                                  setShiftEditForm({
                                    clock_in: toMountainInputValue(s.clock_in),
                                    clock_out: toMountainInputValue(s.clock_out),
                                    role: s.role || '',
                                    clock_in_utc: s.clock_in,
                                    clock_out_utc: s.clock_out || '',
                                  })
                                }}
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
        )}

        {/* CALLOUTS TAB */}
        {tab === 'callouts' && (() => {
          const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
          const pendingCallouts  = callouts.filter(c => (!c.status || c.status === 'pending') && c.callout_date >= todayStr)
          const approvedCallouts = callouts.filter(c => c.status === 'approved' && !c.covered_by && c.callout_date >= todayStr)
          const closedCallouts   = callouts.filter(c => c.status === 'denied' || (c.status === 'approved' && c.covered_by))
          const pendingCovers    = coverRequests.filter(r => r.status === 'pending')
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                                    <button onClick={() => approveCover(r)} disabled={approvingCoverId === r.id} style={{ padding: '0.25rem 0.7rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                                      {approvingCoverId === r.id ? '...' : '✓ Assign'}
                                    </button>
                                    <button onClick={() => denyCover(r.id)} disabled={approvingCoverId === r.id} style={{ padding: '0.25rem 0.7rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✕</button>
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
                          <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '100px', background: c.covered_by ? 'rgba(2,65,107,0.1)' : 'rgba(239,68,68,0.08)', color: c.covered_by ? 'var(--accent)' : '#ef4444', border: `1px solid ${c.covered_by ? 'rgba(2,65,107,0.35)' : 'rgba(239,68,68,0.25)'}` }}>{c.covered_by ? 'covered' : 'denied'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* HOURS TAB */}
        {tab === 'hours' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {hoursLoading ? (
              <p style={{ color: 'var(--muted)', padding: '1rem' }}>Loading...</p>
            ) : hoursSubmissions.length === 0 ? (
              <div style={card}><p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No hours submissions yet.</p></div>
            ) : (
              <>
                {hoursSubmissions.filter(h => h.status === 'pending' && h.profiles?.role !== 'admin').length > 0 && (
                  <div style={card}>
                    <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>
                      Pending Approval
                      <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.55rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(96,165,250,0.3)' }}>
                        {hoursSubmissions.filter(h => h.status === 'pending' && h.profiles?.role !== 'admin').length}
                      </span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {hoursSubmissions.filter(h => h.status === 'pending' && h.profiles?.role !== 'admin').map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.75rem' }}>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{h.profiles?.full_name}</p>
                            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{h.work_date} &nbsp;·&nbsp; {h.role} &nbsp;·&nbsp; <span style={{ fontFamily: 'DM Mono, monospace' }}>{h.hours}h</span></p>
                            {h.notes && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>{h.notes}</p>}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => approveHours(h)} disabled={approvingHoursId === h.id} style={{ padding: '0.4rem 0.9rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.35)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                              {approvingHoursId === h.id ? '...' : '✓ Approve'}
                            </button>
                            <button onClick={() => rejectHours(h.id)} disabled={approvingHoursId === h.id} style={{ padding: '0.4rem 0.9rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hoursSubmissions.filter(h => h.status !== 'pending' && h.profiles?.role !== 'admin').length > 0 && (
                  <div style={card}>
                    <h2 style={{ fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)' }}>Previously Reviewed</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {hoursSubmissions.filter(h => h.status !== 'pending' && h.profiles?.role !== 'admin').map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', opacity: 0.75 }}>
                          <div>
                            <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{h.profiles?.full_name}</span>
                            <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{h.work_date} · {h.role} · {h.hours}h</span>
                          </div>
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 500, background: h.status === 'approved' ? 'rgba(2,65,107,0.12)' : 'rgba(239,68,68,0.1)', color: h.status === 'approved' ? 'var(--accent)' : '#ef4444', border: `1px solid ${h.status === 'approved' ? 'rgba(2,65,107,0.35)' : 'rgba(239,68,68,0.25)'}` }}>{h.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* AUDIT LOG TAB */}
        {tab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={card}>
              <p style={{ 
                fontSize: '0.9rem', 
                color: 'var(--muted)', 
                lineHeight: 1.5,
                maxWidth: '600px'
              }}>
                This tool helps maintain consistency across shifts by tracking administrative actions and providing clear visibility into changes.
              </p>
            </div>

            {/* Filters */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Filters</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Admin</label>
                  <select value={auditFilterAdmin} onChange={e => setAuditFilterAdmin(e.target.value)} style={inputStyle}>
                    <option value="">All admins</option>
                    {adminList.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Action type</label>
                  <select value={auditFilterAction} onChange={e => setAuditFilterAction(e.target.value)} style={inputStyle}>
                    <option value="">All actions</option>
                    {Object.entries(ACTION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>From date</label>
                  <input type="date" value={auditFilterFrom} onChange={e => setAuditFilterFrom(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>To date</label>
                  <input type="date" value={auditFilterTo} onChange={e => setAuditFilterTo(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button onClick={loadAuditLogs} disabled={auditLoading} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: auditLoading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {auditLoading ? 'Loading...' : 'Apply Filters'}
                </button>
                <button onClick={() => {
                  setAuditFilterAdmin('')
                  setAuditFilterAction('')
                  setAuditFilterFrom('')
                  setAuditFilterTo('')
                  setTimeout(loadAuditLogs, 50)
                }} style={{ padding: '0.75rem 1rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  Reset
                </button>
              </div>
            </div>

            {/* Log entries */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ fontWeight: 600 }}>
                  Activity Log
                  {auditLogs.length > 0 && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>— {auditLogs.length} entries</span>
                  )}
                </h2>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Last 2 weeks by default</span>
              </div>
              {auditLoading ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</p>
              ) : auditLogs.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No activity found for the selected filters.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {auditLogs.map(log => {
                    const color = ACTION_COLORS[log.action] || '#94a3b8'
                    const label = ACTION_LABELS[log.action] || log.action
                    return (
                      <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        {/* Color dot */}
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, marginTop: '0.35rem' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 600, background: color + '18', color, border: `1px solid ${color}44` }}>
                                {label}
                              </span>
                              {log.target_name && (
                                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{log.target_name}</span>
                              )}
                            </div>
                            <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>
                              {formatDateTime(log.created_at)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                              by Admin
                            </span>
                            {log.details && (
                              <>
                                <span style={{ color: 'var(--border)' }}>·</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>{log.details}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
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
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>School</label>
                    <select value={newSchool} onChange={e => setNewSchool(e.target.value)} style={inputStyle}>
                      <option value="">— Select school —</option>
                      {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Major</label>
                    <select value={newMajor} onChange={e => setNewMajor(e.target.value)} style={inputStyle}>
                      <option value="">— Select major —</option>
                      {MAJORS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </>}
              </div>
              <button type="submit" disabled={creating} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {creating ? 'Creating...' : 'Create Account'}
              </button>
            </form>
          </div>
        )}

        {/* MESSAGES TAB — updated with image support */}
        {tab === 'messages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[['inbox','Inbox'],['sent','Sent'],['compose','Compose']].map(([key, label]) => (
                <button key={key} onClick={() => setMsgView(key)} style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: msgView === key ? 'var(--accent)' : 'var(--surface)', color: msgView === key ? '#0a0f0a' : 'var(--muted)', border: msgView === key ? 'none' : '1px solid var(--border)' }}>{label}</button>
              ))}
            </div>

            {msgView === 'inbox' && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>All Messages</h2>
                {adminMessages.filter(m => m.sender_id !== profile?.id).length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No messages yet.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {adminMessages.filter(m => m.sender_id !== profile?.id).map(m => <MessageCard key={m.id} m={m} />)}
                  </div>
                )}
              </div>
            )}

            {msgView === 'sent' && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Sent Messages</h2>
                {adminMessages.filter(m => m.sender_id === profile?.id).length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No sent messages yet.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {adminMessages.filter(m => m.sender_id === profile?.id).map(m => <MessageCard key={m.id} m={m} />)}
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
                      {[{ value: 'everyone', label: 'Everyone' }, { value: 'affiliation_missionary', label: 'Missionaries' }, { value: 'admin', label: 'Admins' }, { value: 'shift', label: 'Shift' }, { value: 'role', label: 'Role' }, { value: 'volunteer', label: 'Individual' }].map(opt => (
                        <button key={opt.value} type="button" onClick={() => setMsgRecipientType(opt.value)} style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: msgRecipientType === opt.value ? 'var(--accent)' : 'var(--surface)', color: msgRecipientType === opt.value ? '#0a0f0a' : 'var(--muted)', border: msgRecipientType === opt.value ? 'none' : '1px solid var(--border)' }}>{opt.label}</button>
                      ))}
                    </div>
                    {msgRecipientType === 'shift' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which shift</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {dayShiftCombos.map(({ day, shift, label }) => { const active = msgRecipientDay === day && msgRecipientShift === shift; return <button key={label} type="button" onClick={() => { setMsgRecipientDay(day); setMsgRecipientShift(shift) }} style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Mono, monospace', background: active ? '#1e40af' : 'var(--surface)', color: active ? '#bfdbfe' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' }}>{label}</button> })}
                        </div>
                      </div>
                    )}
                    {msgRecipientType === 'role' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which role</label>
                        <select value={msgRecipientRole} onChange={e => setMsgRecipientRole(e.target.value)} style={inputStyle}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                      </div>
                    )}
                    {msgRecipientType === 'volunteer' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which volunteer</label>
                        <select value={msgRecipientVolId} onChange={e => setMsgRecipientVolId(e.target.value)} style={inputStyle}><option value="">— Select volunteer —</option>{volunteers.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}</select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>Message</label>
                    <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} rows={4} placeholder="Write your message..." style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>

                  {/* Image attachment */}
                  <div>
                    <label style={labelStyle}>Attach image <span style={{ textTransform: 'none', fontSize: '0.72rem', color: 'var(--muted)' }}>(optional · max 5 MB)</span></label>
                    {msgImagePreview ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={msgImagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)', display: 'block' }} />
                        <button type="button" onClick={clearImage} style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif', width: '100%', justifyContent: 'center' }}>
                        📎 Choose image
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} style={{ display: 'none' }} />
                  </div>

                  <button type="submit" disabled={sendingMsg || uploadingImage || (!msgBody.trim() && !msgImageFile) || (msgRecipientType === 'volunteer' && !msgRecipientVolId)}
                    style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: sendingMsg ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {uploadingImage ? 'Uploading image...' : sendingMsg ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: toast.type === 'success' ? '#0a0f0a' : '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            {toast.text}
          </div>
        )}

        {/* Lightbox */}
        {lightboxUrl && (
          <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem', cursor: 'zoom-out' }}>
            <img src={lightboxUrl} alt="Full size" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()} />
            <button onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', color: '#fff', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        )}

      </div>
    </div>
  )
}
