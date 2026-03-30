'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function CSPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  const [activeShifts, setActiveShifts] = useState([])
  const [schedule, setSchedule] = useState([])
  const [volunteers, setVolunteers] = useState([])

  const [tab, setTab] = useState('clocked')

  useEffect(() => {
    checkAccess()
  }, [])

  async function checkAccess() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('default_role')
      .eq('id', user.id)
      .single()

    if (profile?.default_role !== 'Information Systems') {
      router.push('/volunteer')
      return
    }

    setAuthorized(true)
    await loadData()
    setLoading(false)
  }

  async function loadData() {
    const { data: shifts } = await supabase
      .from('active_shifts')
      .select('*')

    const { data: sched } = await supabase
      .from('schedule')
      .select('*')

    const { data: vols } = await supabase
      .from('profiles')
      .select('*')

    setActiveShifts(shifts || [])
    setSchedule(sched || [])
    setVolunteers(vols || [])
  }

  const getVolunteer = (id) =>
    volunteers.find(v => v.id === id)

  const clockedInIds = new Set(activeShifts.map(s => s.volunteer_id))

  const scheduledWithStatus = schedule.map(s => ({
    ...s,
    volunteer: getVolunteer(s.volunteer_id),
    isClockedIn: clockedInIds.has(s.volunteer_id)
  }))

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: 'gray' }}>
        Checking access...
      </div>
    )
  }

  if (!authorized) {
    return null
  }

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem' }}>

      {/* HEADER */}
      <h1 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1rem' }}>
        Clinical Supervisor Dashboard
      </h1>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setTab('clocked')}>
          Clocked In
        </button>

        <button onClick={() => setTab('scheduled')}>
          Scheduled
        </button>

        <button onClick={() => setTab('compare')}>
          Not Clocked In
        </button>
      </div>

      {/* TAB CONTENT */}

      {/* CLOCKED IN */}
      {tab === 'clocked' && (
        <div>
          <h2>Currently Clocked In</h2>

          {activeShifts.length === 0 ? (
            <p>No one clocked in</p>
          ) : (
            activeShifts.map(s => {
              const vol = getVolunteer(s.volunteer_id)

              return (
                <div key={s.id}>
                  {vol?.full_name} — since{' '}
                  {new Date(s.clock_in).toLocaleTimeString()}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* SCHEDULED */}
      {tab === 'scheduled' && (
        <div>
          <h2>Full Schedule</h2>

          {schedule.map(s => {
            const vol = getVolunteer(s.volunteer_id)

            return (
              <div key={s.id}>
                {vol?.full_name} — {s.day_of_week} {s.shift_time}
              </div>
            )
          })}
        </div>
      )}

      {/* NOT CLOCKED IN (COMPARISON VIEW) */}
      {tab === 'compare' && (
        <div>
          <h2>Scheduled but NOT Clocked In</h2>

          {scheduledWithStatus
            .filter(s => !s.isClockedIn)
            .length === 0 ? (
            <p>Everyone scheduled is currently clocked in</p>
          ) : (
            scheduledWithStatus
              .filter(s => !s.isClockedIn)
              .map(s => (
                <div key={s.id} style={{ color: 'red' }}>
                  {s.volunteer?.full_name || 'Unknown'} — {s.day_of_week} {s.shift_time}
                </div>
              ))
          )}
        </div>
      )}

    </div>
  )
}