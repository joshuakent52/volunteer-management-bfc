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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>

      <h1 style={{ fontSize: '1.4rem', fontWeight: 600 }}>
        Clinical Supervisor Dashboard
      </h1>

      {/* SCHEDULE */}
      <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>My Schedule</h2>

      {schedule.map(s => {
        const vol = getVolunteer(s.volunteer_id)

        return (
          <div key={s.id}>
            {vol?.full_name} — {s.day_of_week} {s.shift_time}
          </div>
        )
      })}

    </div>
  )
}