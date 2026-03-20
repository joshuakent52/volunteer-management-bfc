'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DAYS, SHIFTS, ROLES } from '../../lib/constants'
import { weekOfMonth } from '../../lib/timeUtils'
import { card, inputStyle, labelStyle, pillBtn } from '../../lib/styles'

export default function ScheduleTab({ schedule, callouts, volunteers, onScheduleChange, showMessage }) {
  const [scheduleDay, setScheduleDay] = useState('monday')
  const [scheduleShift, setScheduleShift] = useState('10-2')
  const [addingRole, setAddingRole] = useState(null)
  const [addVolId, setAddVolId] = useState('')
  const [addingEntry, setAddingEntry] = useState(false)
  const [addStartDate, setAddStartDate] = useState('')
  const [addEndDate, setAddEndDate] = useState('')
  const [addWeekPattern, setAddWeekPattern] = useState('every')
  const [addNotes, setAddNotes] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [dateCoverShifts, setDateCoverShifts] = useState([])

  const volunteerList = volunteers
    .filter(v => v.role === 'volunteer' && (v.status || 'active') === 'active')
    .sort((a, b) => {
      const lastName = n => (n?.full_name?.split(' ').slice(-1)[0] || '').toLowerCase()
      return lastName(a).localeCompare(lastName(b))
    })

  async function loadDateCoverShifts(date) {
    const { data } = await supabase
      .from('shifts')
      .select('*, profiles(id, full_name)')
      .gte('clock_in', date + 'T00:00:00Z')
      .lt('clock_in', date + 'T23:59:59Z')
    setDateCoverShifts(data || [])
  }

  function getEntries(day, shift, role) {
    if (!scheduleDate) {
      return schedule.filter(s => s.day_of_week === day && s.shift_time === shift && s.role === role)
    }
    const wom = weekOfMonth(scheduleDate)
    return schedule.filter(s => {
      if (s.day_of_week !== day || s.shift_time !== shift || s.role !== role) return false
      if (s.start_date && s.start_date > scheduleDate) return false
      if (s.end_date   && s.end_date   < scheduleDate) return false
      if (s.week_pattern === 'odd'  && wom % 2 !== 1) return false
      if (s.week_pattern === 'even' && wom % 2 !== 0) return false
      return true
    })
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
      start_date: addStartDate || null,
      end_date: addEndDate || null,
      week_pattern: addWeekPattern || 'every',
      notes: addNotes || null,
    })
    if (error) showMessage(error.message, 'error')
    else {
      showMessage('Volunteer assigned!', 'success')
      setAddingRole(null); setAddVolId('')
      setAddStartDate(''); setAddEndDate(''); setAddWeekPattern('every'); setAddNotes('')
      onScheduleChange()
    }
    setAddingEntry(false)
  }

  async function handleRemoveEntry(id) {
    const { error } = await supabase.from('schedule').delete().eq('id', id)
    if (error) showMessage(error.message, 'error')
    else { showMessage('Removed from schedule', 'success'); onScheduleChange() }
  }

  return (
    <div>
      {/* Day / Shift / Date controls */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {DAYS.map(d => (
            <button key={d} onClick={() => { setScheduleDay(d); setAddingRole(null); setScheduleDate(''); setDateCoverShifts([]) }}
              style={{ ...pillBtn(scheduleDay === d, false), textTransform: 'capitalize' }}>{d.slice(0,3)}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {SHIFTS.map(sh => (
            <button key={sh} onClick={() => { setScheduleShift(sh); setAddingRole(null); setScheduleDate(''); setDateCoverShifts([]) }}
              style={pillBtn(scheduleShift === sh, true)}>{sh}</button>
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

      {/* Role rows */}
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
                    const coverShift = approvedCallout && dateCoverShifts.find(s => s.volunteer_id === approvedCallout.covered_by)
                    const coverName = coverShift ? coverShift.profiles?.full_name : null
                    return (
                      <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.3rem 0.6rem 0.3rem 0.75rem', borderRadius: '100px', fontSize: '0.85rem',
                          background: approvedCallout ? 'rgba(96,165,250,0.08)' : 'rgba(2,65,107,0.08)',
                          border: `1px solid ${approvedCallout ? 'rgba(96,165,250,0.4)' : 'rgba(2,65,107,0.35)'}`,
                          color: approvedCallout ? 'var(--warn)' : 'var(--text)',
                        }}>
                          {approvedCallout && <span style={{ fontSize: '0.7rem' }}>out</span>}
                          <span style={{ textDecoration: approvedCallout ? 'line-through' : 'none', opacity: approvedCallout ? 0.6 : 1 }}>{entry.profiles?.full_name}</span>
                          {entry.notes && <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontStyle: 'italic' }}>({entry.notes})</span>}
                          {entry.week_pattern && entry.week_pattern !== 'every' && (
                            <span style={{ fontSize: '0.65rem', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: '4px', padding: '0.1rem 0.35rem' }}>
                              {entry.week_pattern === 'odd' ? '1st&3rd' : '2nd&4th'}
                            </span>
                          )}
                          {(entry.start_date || entry.end_date) && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }} title={`${entry.start_date || '...'} → ${entry.end_date || '...'}`}></span>
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
                    {[{ value: 'every', label: 'Every week' }, { value: 'odd', label: '1st & 3rd' }, { value: 'even', label: '2nd & 4th' }].map(opt => (
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
  )
}
