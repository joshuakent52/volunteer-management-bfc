'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { DAYS, SHIFTS, ROLES, MAX_FILE_SIZE } from '../../lib/constants'
import { formatDate, formatTime, asUTC, formatDateTime } from '../../lib/timeUtils'
import { getInboxMessages } from '../../lib/messageUtils'
import { MessageCard } from '../../components/MessageCard'

export const dynamic = 'force-dynamic'

export default function VolunteerPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeShift, setActiveShift] = useState(null)
  const [shifts, setShifts] = useState([])
  const [schedule, setSchedule] = useState([])
  const [calloutDate, setCalloutDate] = useState('')
  const [calloutShift, setCalloutShift] = useState('')
  const [calloutReason, setCalloutReason] = useState('')
  const [calloutRole, setCalloutRole] = useState('')
  const [calloutMode, setCalloutMode] = useState('single')
  const [calloutStartDate, setCalloutStartDate] = useState('')
  const [calloutEndDate, setCalloutEndDate] = useState('')
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [clockLoading, setClockLoading] = useState(false)
  const [tab, setTab] = useState('clock')

  // Messaging state
  const [messages, setMessages] = useState([])
  const [msgBody, setMsgBody] = useState('')
  const [msgRecipientType, setMsgRecipientType] = useState('everyone')
  const [msgRecipientDay, setMsgRecipientDay] = useState(null)
  const [msgRecipientShift, setMsgRecipientShift] = useState(null)
  const [msgRecipientRole, setMsgRecipientRole] = useState(ROLES[0] || '')
  const [msgRecipientVolId, setMsgRecipientVolId] = useState('')
  // kept for backward compat (used by existing shift/role sub-selectors)
  const [msgSelectedShift, setMsgSelectedShift] = useState(null)
  const [msgSelectedRole, setMsgSelectedRole] = useState(null)
  const [sendingMsg, setSendingMsg] = useState(false)
  const [msgView, setMsgView] = useState('inbox')
  const [volunteers, setVolunteers] = useState([])
  const [allDayShiftCombos, setAllDayShiftCombos] = useState([])

  // Unread tracking
  const [readMessageIds, setReadMessageIds] = useState(new Set())

  // Image attachment state
  const [msgImageFile, setMsgImageFile] = useState(null)
  const [msgImagePreview, setMsgImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef(null)

  // Lightbox state
  const [lightboxUrl, setLightboxUrl] = useState(null)

  // Account / password change
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showShiftHistory, setShowShiftHistory] = useState(false)

  // Open shifts / cover requests
  const [openShifts, setOpenShifts] = useState([])
  const [myCoverRequests, setMyCoverRequests] = useState([])
  const [requestingCoverId, setRequestingCoverId] = useState(null)

  // Hours submission state
  const [hoursDate, setHoursDate] = useState('')
  const [hoursRole, setHoursRole] = useState('')
  const [hoursWorked, setHoursWorked] = useState('')
  const [hoursNotes, setHoursNotes] = useState('')
  const [submittingHours, setSubmittingHours] = useState(false)
  const [myHoursSubmissions, setMyHoursSubmissions] = useState([])

  // All shifts for total hours (no limit)
  const [allShifts, setAllShifts] = useState([])

  const isAdmin = profile?.role === 'admin'
  const isClinicalSupervisor = profile?.default_role === 'Clinical Supervisor'

  useEffect(() => { init() }, [])

  // Mark all inbox messages as read when the user opens the messages tab to inbox
  useEffect(() => {
    if (tab === 'messages' && msgView === 'inbox' && user) {
      markInboxAsRead()
    }
  }, [tab, msgView, user])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/'; return }
    setUser(user)

    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    setProfile(profileData)

    const { data: open } = await supabase
      .from('shifts').select('*')
      .eq('volunteer_id', user.id)
      .is('clock_out', null)
      .single()
    setActiveShift(open || null)

    const { data: history } = await supabase
      .from('shifts').select('*')
      .eq('volunteer_id', user.id)
      .order('clock_in', { ascending: false })
      .limit(10)
    setShifts(history || [])

    const { data: all } = await supabase
      .from('shifts').select('clock_in, clock_out')
      .eq('volunteer_id', user.id)
      .not('clock_out', 'is', null)
    setAllShifts(all || [])

    const { data: sched } = await supabase
      .from('schedule').select('*, profiles(full_name)')
      .eq('volunteer_id', user.id)
      .order('day_of_week')
    setSchedule(sched || [])

    await loadMessages(user.id)

    // Load volunteers list (for Individual recipient option)
    const { data: vols } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'volunteer')
      .order('full_name')
    setVolunteers(vols || [])

    // Load all day/shift combos from schedule table (admin needs the full list)
    const { data: allSched } = await supabase
      .from('schedule')
      .select('day_of_week, shift_time')
    const seen = new Set()
    const combos = []
    ;(allSched || []).forEach(s => {
      const key = `${s.day_of_week}|${s.shift_time}`
      if (!seen.has(key)) {
        seen.add(key)
        const d = s.day_of_week
        combos.push({ key, day: d, shift: s.shift_time, label: `${d.charAt(0).toUpperCase() + d.slice(1,3)} ${s.shift_time}` })
      }
    })
    // Sort by day order then shift
    const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
    combos.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.shift.localeCompare(b.shift))
    setAllDayShiftCombos(combos)

    const { data: openSubs } = await supabase
      .from('callouts')
      .select('*, volunteer:profiles!callouts_volunteer_id_fkey(full_name)')
      .eq('status', 'approved')
      .is('covered_by', null)
      .gte('callout_date', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }))
      .order('callout_date', { ascending: true })
    setOpenShifts((openSubs || []).map(c => ({ ...c, profiles: c.volunteer })))

    const { data: myCoverReqs } = await supabase
      .from('shift_cover_requests')
      .select('callout_id, status')
      .eq('volunteer_id', user.id)
    setMyCoverRequests(myCoverReqs || [])

    const { data: hoursSubs } = await supabase
      .from('hours_submissions')
      .select('*')
      .eq('volunteer_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(20)
    setMyHoursSubmissions(hoursSubs || [])

    setLoading(false)
  }

  async function loadMessages(uid) {
    const userId = uid || user?.id
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(50)
    setMessages(msgs || [])

    // Load which messages this user has already read
    if (userId) {
      const { data: reads } = await supabase
        .from('message_reads')
        .select('message_id')
        .eq('user_id', userId)
      setReadMessageIds(new Set((reads || []).map(r => r.message_id)))
    }
  }

  // Insert read receipts for all current inbox messages
  async function markInboxAsRead() {
    if (!user) return
    // Re-derive inbox using current state (same filter as render)
    const inbox = messages.filter(m => {
      if (m.sender_id === user.id) return false
      if (m.recipient_type === 'affiliation_missionary' && profile?.affiliation !== 'missionary') return false
      return true
    })
    const unreadInbox = inbox.filter(m => !readMessageIds.has(m.id))
    if (unreadInbox.length === 0) return

    const rows = unreadInbox.map(m => ({ user_id: user.id, message_id: m.id }))
    await supabase.from('message_reads').upsert(rows, { onConflict: 'user_id,message_id' })
    setReadMessageIds(prev => {
      const next = new Set(prev)
      unreadInbox.forEach(m => next.add(m.id))
      return next
    })
  }

  // ── Image helpers ─────────────────────────────────────────────────────────

  function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) { showToast('Image must be under 5 MB', 'error'); return }
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
    const { error } = await supabase.storage
      .from('message-images')
      .upload(path, msgImageFile, { contentType: msgImageFile.type, upsert: false })
    setUploadingImage(false)
    if (error) { showToast('Image upload failed: ' + error.message, 'error'); return null }
    const { data: { publicUrl } } = supabase.storage.from('message-images').getPublicUrl(path)
    return publicUrl
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async function handleSendMessage(e) {
    e.preventDefault()
    if (!msgBody.trim() && !msgImageFile) return
    setSendingMsg(true)

    const imageUrl = await uploadImage(user.id)
    if (msgImageFile && !imageUrl) { setSendingMsg(false); return }

    // Resolve shift/role from the two possible sub-selector styles:
    // - admin path: msgRecipientDay + msgRecipientShift (from dayShiftCombos buttons)
    // - volunteer path: msgSelectedShift object, msgSelectedRole string
    const resolvedDay   = msgRecipientType === 'shift'
      ? (isAdmin ? msgRecipientDay   : msgSelectedShift?.day       || null)
      : null
    const resolvedShift = msgRecipientType === 'shift'
      ? (isAdmin ? msgRecipientShift : msgSelectedShift?.shift_time || null)
      : null
    const resolvedRole  = msgRecipientType === 'role'
      ? (isAdmin ? msgRecipientRole  : msgSelectedRole              || null)
      : null

    const payload = {
      sender_id: user.id,
      recipient_type: msgRecipientType,
      body: msgBody.trim(),
      image_url: imageUrl || null,
      recipient_shift: resolvedShift,
      recipient_day:   resolvedDay,
      recipient_role:  resolvedRole,
      recipient_volunteer_id: msgRecipientType === 'volunteer' ? (msgRecipientVolId || null) : null,
    }

    const { error } = await supabase.from('messages').insert(payload)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Message sent!', 'success')
      setMsgBody('')
      clearImage()
      setMsgRecipientType('everyone')
      setMsgRecipientDay(null)
      setMsgRecipientShift(null)
      setMsgRecipientRole(ROLES[0] || '')
      setMsgRecipientVolId('')
      setMsgSelectedShift(null)
      setMsgSelectedRole(null)
      setMsgView('inbox')
      await loadMessages()
    }
    setSendingMsg(false)
  }

  // ── Other handlers ────────────────────────────────────────────────────────

  function getCurrentShiftWindow() {
    const now = new Date()
    const mtnStr = now.toLocaleString('en-US', { timeZone: 'America/Denver' })
    const mtn = new Date(mtnStr)
    const dayIndex = mtn.getDay()
    if (dayIndex === 0 || dayIndex === 6) return { day: null, shift: null }
    const day = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex]
    const h = mtn.getHours() + mtn.getMinutes() / 60
    const shift = h >= 10 && h < 14 ? '10-2' : h >= 14 && h < 18 ? '2-6' : null
    return { day, shift }
  }

  async function handleClockIn() {
    setClockLoading(true)
    let resolvedRole = null
    const { day, shift } = getCurrentShiftWindow()
    if (day && shift) {
      const matches = schedule.filter(s => s.day_of_week === day && s.shift_time === shift)
      if (matches.length === 1) resolvedRole = matches[0].role
      else if (matches.length > 1) {
        const preferred = matches.find(s => s.role === profile?.default_role)
        resolvedRole = preferred ? preferred.role : matches[0].role
      }
    }
    if (!resolvedRole && profile?.default_role) resolvedRole = profile.default_role
    const { data, error } = await supabase
      .from('shifts')
      .insert({ volunteer_id: user.id, clock_in: new Date().toISOString(), role: resolvedRole })
      .select().single()
    if (error) showToast(error.message, 'error')
    else { setActiveShift(data); showToast('Clocked in successfully!', 'success') }
    setClockLoading(false)
  }

  async function handleClockOut() {
    setClockLoading(true)
    const { error } = await supabase
      .from('shifts')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', activeShift.id)
    if (error) showToast(error.message, 'error')
    else { setActiveShift(null); showToast('Clocked out. Great work!', 'success'); init() }
    setClockLoading(false)
  }

  async function handleCallout(e) {
    e.preventDefault()
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    if (calloutMode === 'single') {
      const derivedDay = calloutDate ? dayNames[new Date(calloutDate + 'T12:00:00').getDay()] : null
      const { error } = await supabase.from('callouts').insert({
        volunteer_id: user.id, callout_date: calloutDate, day_of_week: derivedDay,
        shift_time: calloutShift || null, reason: calloutReason, role: calloutRole || null,
      })
      if (error) showToast(error.message, 'error')
      else { showToast('Call-out submitted!', 'success'); setCalloutDate(''); setCalloutShift(''); setCalloutReason(''); setCalloutRole('') }
      return
    }
    if (!calloutStartDate || !calloutEndDate) return
    const start = new Date(calloutStartDate + 'T12:00:00')
    const end = new Date(calloutEndDate + 'T12:00:00')
    const rows = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayName = dayNames[d.getDay()]
      if (dayName === 'sunday' || dayName === 'saturday') continue
      const dateStr = d.toLocaleDateString('en-CA')
      const matchingShifts = schedule.filter(s => s.day_of_week === dayName)
      if (matchingShifts.length === 0) continue
      const seen = new Set()
      for (const s of matchingShifts) {
        const key = `${dateStr}|${s.shift_time}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({ volunteer_id: user.id, callout_date: dateStr, day_of_week: dayName, shift_time: s.shift_time, reason: calloutReason || null, role: s.role || null })
      }
    }
    if (rows.length === 0) { showToast('No scheduled shifts found in that date range.', 'error'); return }
    const { error } = await supabase.from('callouts').insert(rows)
    if (error) showToast(error.message, 'error')
    else { showToast(`${rows.length} call-out${rows.length !== 1 ? 's' : ''} submitted!`, 'success'); setCalloutStartDate(''); setCalloutEndDate(''); setCalloutReason('') }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return }
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters', 'error'); return }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) showToast(error.message, 'error')
    else { showToast('Password updated!', 'success'); setNewPassword(''); setConfirmPassword('') }
    setChangingPassword(false)
  }

  async function handleRequestCover(calloutId) {
    setRequestingCoverId(calloutId)
    const { error } = await supabase.from('shift_cover_requests').insert({ callout_id: calloutId, volunteer_id: user.id })
    if (error) showToast(error.message, 'error')
    else { showToast('Cover request submitted!', 'success'); setMyCoverRequests(prev => [...prev, { callout_id: calloutId, status: 'pending' }]) }
    setRequestingCoverId(null)
  }

  async function handleSubmitHours(e) {
    e.preventDefault()
    if (!hoursDate || !hoursRole || !hoursWorked) return
    setSubmittingHours(true)
    const { error } = await supabase.from('hours_submissions').insert({
      volunteer_id: user.id, work_date: hoursDate, role: hoursRole,
      hours: parseFloat(hoursWorked), notes: hoursNotes || null, status: 'pending',
    })
    if (error) showToast(error.message, 'error')
    else {
      showToast('Hours submitted for approval!', 'success')
      setHoursDate(''); setHoursRole(''); setHoursWorked(''); setHoursNotes('')
      const { data: hoursSubs } = await supabase.from('hours_submissions').select('*').eq('volunteer_id', user.id).order('submitted_at', { ascending: false }).limit(20)
      setMyHoursSubmissions(hoursSubs || [])
    }
    setSubmittingHours(false)
  }

  function showToast(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  function calcHours(clock_in, clock_out) { if (!clock_out) return 'Active'; return ((asUTC(clock_out) - asUTC(clock_in)) / 3600000).toFixed(1) + 'h' }
  function totalHours() { return allShifts.reduce((acc, s) => acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000, 0).toFixed(1) }

  async function handleSignOut() { await supabase.auth.signOut(); window.location.href = '/' }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const inboxMessages = getInboxMessages(messages, user, profile)
  const sentMessages = messages.filter(m => m.sender_id === user?.id)
  const unreadCount = inboxMessages.filter(m => !readMessageIds.has(m.id)).length

  // Shift combos for compose: admins see every scheduled shift, volunteers only their own
  const myShiftCombos = schedule.reduce((acc, s) => {
    const key = `${s.day_of_week}|${s.shift_time}`
    if (!acc.find(x => x.key === key)) acc.push({ key, day: s.day_of_week, shift_time: s.shift_time, label: `${s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1,3)} ${s.shift_time}` })
    return acc
  }, [])
  const myRoles = [...new Set(schedule.map(s => s.role))]

  // dayShiftCombos: what the compose form uses for the shift sub-selector
  // admins see all combos (stored in allDayShiftCombos), volunteers see only their own
  const dayShiftCombos = isAdmin ? allDayShiftCombos : myShiftCombos.map(c => ({ ...c, shift: c.shift_time }))

  const calloutSubmitDisabled = calloutMode === 'single' ? (!calloutDate || !calloutShift || !calloutRole) : (!calloutStartDate || !calloutEndDate)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
              Hey, {profile?.full_name?.split(' ')[0]}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {new Date().toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {(profile?.role === 'admin' || profile?.default_role === 'Clinical Supervisor') && (
              <button
                onClick={() => {
                  if (profile?.default_role === 'Clinical Supervisor') { window.location.href = '/clinical-supervisor'; return }
                  if (window.location.pathname.includes('admin')) { window.location.href = '/volunteer' } else { window.location.href = '/admin' }
                }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Switch View
              </button>
            )}
            <button onClick={handleSignOut} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              Sign out
            </button>
          </div>
        </div>

        {/* Status banner */}
        <div style={{ ...card, marginBottom: '1.5rem', borderColor: activeShift ? 'var(--accent)' : 'var(--border)', background: activeShift ? 'rgba(74,222,128,0.05)' : 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: activeShift ? 'var(--accent)' : 'var(--muted)', boxShadow: activeShift ? '0 0 8px var(--accent)' : 'none' }} />
            <span style={{ fontWeight: 500 }}>{activeShift ? `Clocked in since ${formatTime(activeShift.clock_in)}` : 'Not clocked in'}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[['clock','Clock'],['schedule','Schedule'],['callout','Call-Out'],['messages','Messages'],['account','Account']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              position: 'relative', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              background: tab === key ? 'var(--accent)' : 'var(--surface)',
              color: tab === key ? '#fff' : 'var(--muted)',
              border: tab === key ? 'none' : '1px solid var(--border)',
            }}>
              {label}
              {key === 'messages' && unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-5px', right: '-5px',
                  background: '#ef4444', color: '#fff',
                  borderRadius: '50%', width: '17px', height: '17px',
                  fontSize: '0.65rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--bg)', lineHeight: 1,
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* CLOCK TAB */}
        {tab === 'clock' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Clock In / Out</h2>
            {activeShift ? (
              <button onClick={handleClockOut} disabled={clockLoading} style={{ width: '100%', padding: '1rem', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {clockLoading ? 'Processing...' : 'Clock Out'}
              </button>
            ) : (
              <button onClick={handleClockIn} disabled={clockLoading} style={{ width: '100%', padding: '1rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {clockLoading ? 'Processing...' : 'Clock In'}
              </button>
            )}
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>My Schedule</h2>
            {schedule.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>You have no scheduled shifts yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {DAYS.map(day => {
                  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                  const wom = (() => {
                    const d = new Date(today + 'T12:00:00'); let count = 0; const target = d.getDay()
                    const check = new Date(d.getFullYear(), d.getMonth(), 1)
                    while (check <= d) { if (check.getDay() === target) count++; check.setDate(check.getDate() + 1) }
                    return count
                  })()
                  const dayEntries = schedule.filter(s => {
                    if (s.day_of_week !== day.toLowerCase()) return false
                    if (s.start_date && s.start_date > today) return false
                    if (s.end_date   && s.end_date   < today) return false
                    if (s.week_pattern === 'odd'  && wom % 2 !== 1) return false
                    if (s.week_pattern === 'even' && wom % 2 !== 0) return false
                    return true
                  })
                  if (dayEntries.length === 0) return null
                  return (
                    <div key={day} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <p style={{ fontWeight: 600, textTransform: 'capitalize', marginBottom: '0.6rem' }}>{day}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {SHIFTS.map(shift => {
                          const shiftEntries = dayEntries.filter(s => s.shift_time === shift)
                          if (shiftEntries.length === 0) return null
                          return shiftEntries.map(entry => (
                            <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <div>
                                <span style={{ fontSize: '0.9rem' }}>{entry.role}</span>
                                {entry.week_pattern && entry.week_pattern !== 'every' && (
                                  <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>
                                    {entry.week_pattern === 'odd' ? '1st & 3rd week' : '2nd & 4th week'}
                                  </span>
                                )}
                                {entry.notes && <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>{entry.notes}</span>}
                              </div>
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--muted)', background: 'var(--surface)', padding: '0.2rem 0.6rem', borderRadius: '6px', whiteSpace: 'nowrap' }}>{shift}</span>
                            </div>
                          ))
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* CALLOUT TAB */}
        {tab === 'callout' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Submit a Call-Out</h2>
              <form onSubmit={handleCallout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[['single','Single Shift'],['range','Date Range']].map(([val, label]) => (
                      <button key={val} type="button" onClick={() => { setCalloutMode(val); setCalloutDate(''); setCalloutShift(''); setCalloutRole(''); setCalloutStartDate(''); setCalloutEndDate('') }}
                        style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: calloutMode === val ? 'var(--accent)' : 'var(--surface)', color: calloutMode === val ? '#0a0f0a' : 'var(--muted)', border: calloutMode === val ? 'none' : '1px solid var(--border)' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {calloutMode === 'single' && <>
                  <div><label style={labelStyle}>Date you can't make it</label><input type="date" value={calloutDate} onChange={e => setCalloutDate(e.target.value)} required style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>Shift</label>
                    <select value={calloutShift} onChange={e => { const shift = e.target.value; setCalloutShift(shift); if (calloutDate && shift) { const dn = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; const d = dn[new Date(calloutDate + 'T12:00:00').getDay()]; const m = schedule.find(s => s.day_of_week === d && s.shift_time === shift); if (m?.role) setCalloutRole(m.role) } }} style={inputStyle}>
                      <option value="">— Select —</option>
                      {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={calloutRole} onChange={e => setCalloutRole(e.target.value)} required style={inputStyle}>
                      <option value="">— Select role —</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </>}
                {calloutMode === 'range' && <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div><label style={labelStyle}>From</label><input type="date" value={calloutStartDate} onChange={e => setCalloutStartDate(e.target.value)} required style={inputStyle} /></div>
                    <div><label style={labelStyle}>To</label><input type="date" value={calloutEndDate} onChange={e => setCalloutEndDate(e.target.value)} required style={inputStyle} /></div>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>A call-out will be submitted for each of your scheduled shifts within this range. Weekends are skipped automatically.</p>
                </>}
                <div><label style={labelStyle}>Reason (optional)</label><textarea value={calloutReason} onChange={e => setCalloutReason(e.target.value)} rows={3} placeholder="Let the team know why..." style={{ ...inputStyle, resize: 'vertical' }} /></div>
                <button type="submit" disabled={calloutSubmitDisabled} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: calloutSubmitDisabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: calloutSubmitDisabled ? 0.5 : 1 }}>Submit Call-Out</button>
              </form>
            </div>

            {/* Open shifts */}
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Open Shifts</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Shifts that need coverage — tap to volunteer.</p>
              {openShifts.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No open shifts right now.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {openShifts.map(c => {
                    const myReq = myCoverRequests.find(r => r.callout_id === c.id)
                    const isApproved = myReq?.status === 'approved'
                    return (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: `1px solid ${isApproved ? 'rgba(74,222,128,0.4)' : 'var(--border)'}`, flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.callout_date}<span style={{ marginLeft: '0.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.82rem', color: 'var(--muted)' }}>{c.shift_time}</span></p>
                          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', textTransform: 'capitalize' }}>{c.day_of_week}{c.role ? ` · ${c.role}` : ''}{c.profiles?.full_name ? ` · ${c.profiles.full_name} calling out` : ''}</p>
                        </div>
                        {isApproved
                          ? <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.7rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: 'var(--accent)', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 600 }}>✓ You're covering</span>
                          : myReq
                            ? <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.7rem', borderRadius: '100px', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontWeight: 500 }}>Requested</span>
                            : <button onClick={() => handleRequestCover(c.id)} disabled={requestingCoverId === c.id} style={{ padding: '0.35rem 0.9rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{requestingCoverId === c.id ? '...' : 'I can cover'}</button>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MESSAGES TAB */}
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
                {inboxMessages.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No messages yet.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {inboxMessages.map(m => <MessageCard key={m.id} m={m} readMessageIds={readMessageIds} user={user} setLightboxUrl={setLightboxUrl} />)}
                  </div>
                )}
              </div>
            )}

            {msgView === 'sent' && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Sent Messages</h2>
                {sentMessages.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No sent messages yet.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {sentMessages.map(m => <MessageCard key={m.id} m={m} readMessageIds={readMessageIds} user={user} setLightboxUrl={setLightboxUrl} />)}
                  </div>
                )}
              </div>
            )}

            {msgView === 'compose' && (
              <div style={card}>
                <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>New Message</h2>
                <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Send to</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {(isAdmin
                        ? [
                            { value: 'everyone',               label: 'Everyone'    },
                            { value: 'affiliation_missionary',  label: 'Missionaries'},
                            { value: 'admin',                   label: 'Admins'      },
                            { value: 'shift',                   label: 'Shift'       },
                            { value: 'role',                    label: 'Role'        },
                            { value: 'volunteer',               label: 'Individual'  },
                          ]
                        : [
                            { value: 'everyone', label: 'Everyone' },
                            { value: 'admin',    label: 'Admin'    },
                            { value: 'volunteer',  label: 'Individual'  },
                            { value: 'affiliation_missionary',  label: 'Missionaries'},
                            ...(dayShiftCombos.length > 0 ? [{ value: 'shift', label: 'My Shift' }] : []),
                            ...(myRoles.length  > 0 ? [{ value: 'role',  label: 'My Role'  }] : []),
                          ]
                      ).map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => { setMsgRecipientType(opt.value); setMsgRecipientDay(null); setMsgRecipientShift(null); setMsgSelectedShift(null); setMsgSelectedRole(null) }}
                          style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: msgRecipientType === opt.value ? 'var(--accent)' : 'var(--surface)', color: msgRecipientType === opt.value ? '#0a0f0a' : 'var(--muted)', border: msgRecipientType === opt.value ? 'none' : '1px solid var(--border)' }}
                        >{opt.label}</button>
                      ))}
                    </div>

                    {/* Shift sub-selector */}
                    {msgRecipientType === 'shift' && dayShiftCombos.length > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which shift</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {isAdmin
                            ? dayShiftCombos.map(({ day, shift, label }) => {
                                const active = msgRecipientDay === day && msgRecipientShift === shift
                                return (
                                  <button key={label} type="button"
                                    onClick={() => { setMsgRecipientDay(day); setMsgRecipientShift(shift) }}
                                    style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Mono, monospace', background: active ? '#1e40af' : 'var(--surface)', color: active ? '#bfdbfe' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' }}
                                  >{label}</button>
                                )
                              })
                            : dayShiftCombos.map(combo => {
                                const active = msgSelectedShift?.key === combo.key
                                return (
                                  <button key={combo.key} type="button"
                                    onClick={() => setMsgSelectedShift(combo)}
                                    style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Mono, monospace', background: active ? '#1e40af' : 'var(--surface)', color: active ? '#bfdbfe' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' }}
                                  >{combo.label}</button>
                                )
                              })
                          }
                        </div>
                      </div>
                    )}

                    {/* Role sub-selector — admin: dropdown of all ROLES; volunteer: their own roles as pills */}
                    {msgRecipientType === 'role' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={labelStyle}>Which role</label>
                        {isAdmin
                          ? <select value={msgRecipientRole} onChange={e => setMsgRecipientRole(e.target.value)} style={inputStyle}>
                              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {myRoles.map(role => {
                                const active = msgSelectedRole === role
                                return (
                                  <button key={role} type="button" onClick={() => setMsgSelectedRole(role)}
                                    style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#0a0f0a' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' }}
                                  >{role}</button>
                                )
                              })}
                            </div>
                        }
                      </div>
                    )}

                    {/* Individual volunteer sub-selector — admin only */}
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
                    <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} rows={4} placeholder="Write your message..." style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>

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

                  <button type="submit"
                    disabled={
                      sendingMsg ||
                      uploadingImage ||
                      (!msgBody.trim() && !msgImageFile) ||
                      (msgRecipientType === 'volunteer' && !msgRecipientVolId) ||
                      (msgRecipientType === 'shift' && isAdmin && (!msgRecipientDay || !msgRecipientShift)) ||
                      (msgRecipientType === 'shift' && !isAdmin && !msgSelectedShift) ||
                      (msgRecipientType === 'role'  && !isAdmin && !msgSelectedRole)
                    }
                    style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: sendingMsg ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {uploadingImage ? 'Uploading image...' : sendingMsg ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ACCOUNT TAB */}
        {tab === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ ...card, borderColor: 'var(--accent)', background: 'rgba(2,65,107,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Total Hours</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', lineHeight: 1 }}>{totalHours()}<span style={{ fontSize: '1rem', fontWeight: 500, marginLeft: '0.25rem', color: 'var(--muted)' }}>hrs</span></p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Completed Shifts</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)', lineHeight: 1 }}>{allShifts.length}</p>
              </div>
            </div>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setShowShiftHistory(h => !h)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>Shift History</span>
                <span style={{ color: 'var(--muted)', fontSize: '1.1rem', transform: showShiftHistory ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
              </button>
              {showShiftHistory && (
                <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {allShifts.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No shifts recorded yet.</p> : allShifts.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div><p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{formatDate(s.clock_in)}</p><p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{formatTime(s.clock_in)} → {formatTime(s.clock_out)}</p></div>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: s.clock_out ? 'var(--accent)' : 'var(--warn)' }}>{calcHours(s.clock_in, s.clock_out)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Submit Hours</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Submit hours worked outside of the clock-in system for admin approval.</p>
              <form onSubmit={handleSubmitHours} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div><label style={labelStyle}>Date Worked</label><input type="date" value={hoursDate} onChange={e => setHoursDate(e.target.value)} required style={inputStyle} /></div>
                <div><label style={labelStyle}>Role</label><select value={hoursRole} onChange={e => setHoursRole(e.target.value)} required style={inputStyle}><option value="">— Select role —</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div><label style={labelStyle}>Hours Worked</label><input type="number" min="0.5" max="12" step="0.5" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} required placeholder="e.g. 4" style={inputStyle} /></div>
                <div><label style={labelStyle}>Notes (optional)</label><textarea value={hoursNotes} onChange={e => setHoursNotes(e.target.value)} rows={2} placeholder="Any context for the admin..." style={{ ...inputStyle, resize: 'vertical' }} /></div>
                <button type="submit" disabled={submittingHours || !hoursDate || !hoursRole || !hoursWorked} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: submittingHours ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{submittingHours ? 'Submitting...' : 'Submit Hours'}</button>
              </form>
              {myHoursSubmissions.length > 0 && (
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Your Submissions</p>
                  {myHoursSubmissions.map(h => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div><span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{h.work_date}</span><span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{h.role}</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem' }}>{h.hours}h</span>
                        <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', fontWeight: 500, background: h.status === 'approved' ? 'rgba(74,222,128,0.12)' : h.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.12)', color: h.status === 'approved' ? 'var(--accent)' : h.status === 'rejected' ? '#ef4444' : 'var(--warn)', border: `1px solid ${h.status === 'approved' ? 'rgba(74,222,128,0.3)' : h.status === 'rejected' ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.3)'}` }}>{h.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={card}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Change Password</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Must be at least 6 characters.</p>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div><label style={labelStyle}>New Password</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="New password" style={inputStyle} /></div>
                <div><label style={labelStyle}>Confirm New Password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="Repeat new password" style={inputStyle} /></div>
                <button type="submit" disabled={changingPassword || !newPassword || !confirmPassword} style={{ padding: '0.85rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: changingPassword ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{changingPassword ? 'Updating...' : 'Update Password'}</button>
              </form>
            </div>
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