'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getMountainNow, getMountainLabel } from '../../lib/timeUtils'
import LiveTab from '../../components/admin/LiveTab'
import ScheduleTab from '../../components/admin/ScheduleTab'
import VolunteersTab from '../../components/admin/VolunteersTab'
import ShiftsTab from '../../components/admin/ShiftsTab'
import CalloutsTab from '../../components/admin/CalloutsTab'
import MessagesTab from '../../components/admin/MessagesTab'
import HoursTab from '../../components/admin/HoursTab'
import CreateVolunteerTab from '../../components/admin/CreateVolunteerTab'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  const [profile, setProfile] = useState(null)
  const [volunteers, setVolunteers] = useState([])
  const [activeShifts, setActiveShifts] = useState([])
  const [callouts, setCallouts] = useState([])
  const [schedule, setSchedule] = useState([])
  const [adminMessages, setAdminMessages] = useState([])
  const [coverRequests, setCoverRequests] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [currentTime, setCurrentTime] = useState(getMountainNow())

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
    await Promise.all([
      loadVolunteers(), loadActiveShifts(), loadCallouts(),
      loadSchedule(), loadAdminMessages(), loadCoverRequests(),
    ])
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
    const { data, error } = await supabase
      .from('callouts')
      .select('*, volunteer:profiles!callouts_volunteer_id_fkey(full_name)')
      .order('submitted_at', { ascending: false })
      .limit(100)
    if (error) { console.error('loadCallouts error:', error.message); return }
    const normalised = (data || []).map(c => ({
      ...c,
      profiles: c.volunteer,
      status: c.status ?? (c.is_read ? 'approved' : 'pending'),
    }))
    setCallouts(normalised)
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

  async function loadCoverRequests() {
    const { data } = await supabase
      .from('shift_cover_requests')
      .select('*, profiles(full_name)')
      .order('requested_at', { ascending: false })
    setCoverRequests(data || [])
  }

  function showMessage(text, type) {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading...</p>
    </div>
  )

  const tzLabel = getMountainLabel()
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const messages24h = adminMessages.filter(m => m.created_at >= cutoff24h && m.sender_id !== profile?.id).length
  const pendingCalloutCount = callouts.filter(c => !c.status || c.status === 'pending').length

  const TABS = [
    ['dashboard', 'Live'],
    ['schedule', 'Schedule'],
    ['volunteers', 'Volunteers'],
    ['shifts', 'Shifts'],
    ['callouts', 'Call-Outs'],
    ['messages', 'Messages'],
    ['hours', 'Hours'],
    ['create', 'Add Volunteer'],
  ]

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }

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

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Messages (24h)', value: messages24h, info: messages24h > 0 },
            { label: 'Clocked In Now', value: activeShifts.length, accent: true },
            { label: 'Pending Call-Outs', value: pendingCalloutCount, warn: pendingCalloutCount > 0 },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', borderColor: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : s.info ? '#60a5fa' : 'var(--border)' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: s.accent ? 'var(--accent)' : s.warn ? 'var(--warn)' : s.info ? '#60a5fa' : 'var(--text)' }}>{s.value}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: tab === key ? 'var(--accent)' : 'var(--surface)', color: tab === key ? '#0a0f0a' : 'var(--muted)', border: tab === key ? 'none' : '1px solid var(--border)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'dashboard' && (
          <LiveTab
            volunteers={volunteers}
            activeShifts={activeShifts}
            callouts={callouts}
            schedule={schedule}
          />
        )}

        {tab === 'schedule' && (
          <ScheduleTab
            schedule={schedule}
            callouts={callouts}
            volunteers={volunteers}
            onScheduleChange={loadSchedule}
            showMessage={showMessage}
          />
        )}

        {tab === 'volunteers' && (
          <VolunteersTab
            volunteers={volunteers}
            onVolunteersChange={loadVolunteers}
            showMessage={showMessage}
          />
        )}

        {tab === 'shifts' && (
          <ShiftsTab
            volunteers={volunteers}
            tzLabel={tzLabel}
            showMessage={showMessage}
            onShiftsChange={() => { loadVolunteers(); loadActiveShifts() }}
          />
        )}

        {tab === 'callouts' && (
          <CalloutsTab
            callouts={callouts}
            coverRequests={coverRequests}
            onCalloutsChange={loadCallouts}
            onCoverRequestsChange={loadCoverRequests}
            showMessage={showMessage}
          />
        )}

        {tab === 'messages' && (
          <MessagesTab
            adminMessages={adminMessages}
            volunteers={volunteers}
            profile={profile}
            onMessagesChange={loadAdminMessages}
            showMessage={showMessage}
          />
        )}

        {tab === 'hours' && (
          <HoursTab showMessage={showMessage} />
        )}

        {tab === 'create' && (
          <CreateVolunteerTab
            onVolunteersChange={loadVolunteers}
            showMessage={showMessage}
          />
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
