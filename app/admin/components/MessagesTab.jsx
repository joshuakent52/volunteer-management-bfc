'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DAYS, SHIFTS, ROLES } from '../../lib/constants'
import { formatDateTime } from '../../lib/timeUtils'
import { card, inputStyle, labelStyle } from '../../lib/styles'

export default function MessagesTab({ adminMessages, volunteers, profile, onMessagesChange, showMessage }) {
  const [msgView, setMsgView] = useState('inbox')
  const [msgBody, setMsgBody] = useState('')
  const [msgRecipientType, setMsgRecipientType] = useState('everyone')
  const [msgRecipientShift, setMsgRecipientShift] = useState('10-2')
  const [msgRecipientDay, setMsgRecipientDay] = useState('monday')
  const [msgRecipientRole, setMsgRecipientRole] = useState('Clinical Staff')
  const [msgRecipientVolId, setMsgRecipientVolId] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)

  const dayShiftCombos = DAYS.flatMap(d => SHIFTS.map(s => ({ day: d, shift: s, label: `${d.charAt(0).toUpperCase() + d.slice(1,3)} ${s}` })))

  function recipientLabel(msg) {
    if (msg.recipient_type === 'everyone') return 'Everyone'
    if (msg.recipient_type === 'admin') return 'Admins'
    if (msg.recipient_type === 'affiliation_missionary') return 'Missionaries'
    if (msg.recipient_type === 'volunteer') {
      const v = volunteers.find(v => v.id === msg.recipient_volunteer_id)
      return v?.full_name || 'Volunteer'
    }
    if (msg.recipient_type === 'shift') {
      const day = msg.recipient_day ? msg.recipient_day.charAt(0).toUpperCase() + msg.recipient_day.slice(1, 3) : ''
      return `${day} ${msg.recipient_shift}`
    }
    if (msg.recipient_type === 'role') return msg.recipient_role
    return msg.recipient_type
  }

  async function handleSendMessage(e) {
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
      onMessagesChange()
    }
    setSendingMsg(false)
  }

  const inbox = adminMessages.filter(m => m.sender_id !== profile?.id)
  const sent  = adminMessages.filter(m => m.sender_id === profile?.id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[['inbox','📥 Inbox'],['sent','📤 Sent'],['compose','✏️ Compose']].map(([key, label]) => (
          <button key={key} onClick={() => setMsgView(key)} style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: msgView === key ? 'var(--accent)' : 'var(--surface)', color: msgView === key ? '#0a0f0a' : 'var(--muted)', border: msgView === key ? 'none' : '1px solid var(--border)' }}>{label}</button>
        ))}
      </div>

      {msgView === 'inbox' && (
        <div style={card}>
          <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>All Messages</h2>
          {inbox.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No messages yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {inbox.map(m => (
                <div key={m.id} style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.sender?.full_name || 'Unknown'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{recipientLabel(m)}</span>
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
          {sent.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No sent messages yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sent.map(m => (
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
          <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  <button key={opt.value} type="button" onClick={() => setMsgRecipientType(opt.value)} style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: msgRecipientType === opt.value ? 'var(--accent)' : 'var(--surface)', color: msgRecipientType === opt.value ? '#0a0f0a' : 'var(--muted)', border: msgRecipientType === opt.value ? 'none' : '1px solid var(--border)' }}>{opt.label}</button>
                ))}
              </div>

              {msgRecipientType === 'shift' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={labelStyle}>Which shift</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {dayShiftCombos.map(({ day, shift, label }) => {
                      const active = msgRecipientDay === day && msgRecipientShift === shift
                      return (
                        <button key={label} type="button" onClick={() => { setMsgRecipientDay(day); setMsgRecipientShift(shift) }}
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Mono, monospace', background: active ? '#1e40af' : 'var(--surface)', color: active ? '#bfdbfe' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' }}>
                          {label}
                        </button>
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
            <button type="submit" disabled={sendingMsg || !msgBody.trim() || (msgRecipientType === 'volunteer' && !msgRecipientVolId)}
              style={{ padding: '0.85rem', background: 'var(--accent)', color: '#0a0f0a', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: sendingMsg ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              {sendingMsg ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
