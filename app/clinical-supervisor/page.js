'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CSPage() {
  const [activeShifts, setActiveShifts] = useState([])
  const [schedule, setSchedule] = useState([])
  const [volunteers, setVolunteers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    // RAW DATA ONLY (no joins)
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

    setLoading(false)
  }

  const getVolunteer = (id) =>
    volunteers.find(v => v.id === id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600 }}>
            Command View (Clinical Supervisor)
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Live clock-in + schedule overview (read-only)
          </p>
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : (
          <>
            {/* ACTIVE SHIFTS */}
            <div style={{
              padding: '1rem',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              marginBottom: '1rem'
            }}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
                Currently Clocked In
              </h2>

              {activeShifts.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>No one clocked in</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {activeShifts.map(s => {
                    const vol = getVolunteer(s.volunteer_id)

                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: '0.75rem',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>
                          {vol?.full_name || 'Unknown'}
                        </span>

                        <span style={{ color: 'var(--muted)' }}>
                          since {new Date(s.clock_in).toLocaleTimeString()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* SCHEDULE */}
            <div style={{
              padding: '1rem',
              border: '1px solid var(--border)',
              borderRadius: '10px'
            }}>
              <h2 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
                Scheduled Volunteers
              </h2>

              {schedule.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>No schedule data</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {schedule.map(s => {
                    const vol = getVolunteer(s.volunteer_id)

                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: '0.75rem',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>
                          {vol?.full_name || 'Unassigned'}
                        </span>

                        <span style={{ color: 'var(--muted)' }}>
                          {s.day_of_week} · {s.shift_time} · {s.role}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </>
        )}

      </div>
    </div>
  )
}