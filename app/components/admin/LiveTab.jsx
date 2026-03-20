'use client'
import { card } from '../../../lib/styles'
import { getMountainNow, formatMountain } from '../../../lib/timeUtils'

export default function LiveTab({ volunteers, activeShifts, callouts, schedule }) {
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
      s.day_of_week === currentDay && s.shift_time === currentShift &&
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
        return { id, name: vol?.full_name, role: entry?.role || '—', notes: entry?.notes || null }
      })
      .filter(v => v.name)
  })() : []

  // Birthdays
  const today = getMountainNow()
  const todayMD = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const birthdayVolunteers = volunteers.filter(v => {
    if (!v.birthday) return false
    return v.birthday.slice(5) === todayMD
  })

  // Today's callouts
  const todayMtn = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
  const todaysCallouts = callouts.filter(c => c.callout_date === todayMtn && c.status !== 'denied')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Expected but not clocked in */}
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
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{v.name}</span>
                  {v.notes && <span style={{ fontSize: '0.78rem', color: '#60a5fa', fontStyle: 'italic' }}>({v.notes})</span>}
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{v.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Currently clocked in */}
      <div style={card}>
        <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Currently Clocked In</h2>
        {activeShifts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No one is currently clocked in.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeShifts.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(2,65,107,0.05)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
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

      {/* Today's callouts */}
      {todaysCallouts.length > 0 && (
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
      )}

      {/* Birthdays today */}
      {birthdayVolunteers.length > 0 && (
        <div style={{ ...card, borderColor: 'rgba(129,140,248,0.5)', background: 'rgba(129,140,248,0.04)' }}>
          <h2 style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '1rem' }}>Birthdays Today</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {birthdayVolunteers.map(v => (
              <span key={v.id} style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', background: 'rgba(129,140,248,0.12)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.35)', fontSize: '0.875rem', fontWeight: 500 }}>
                {v.full_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
