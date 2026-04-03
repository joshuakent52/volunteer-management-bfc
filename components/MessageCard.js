export function MessageCard({ m }) {
  const isUnread = !readMessageIds.has(m.id) && m.sender_id !== user?.id
  return (
    <div style={{ padding: '0.75rem 1rem', background: isUnread ? 'rgba(2,65,107,0.04)' : 'var(--bg)', borderRadius: '8px', border: `1px solid ${isUnread ? 'rgba(2,65,107,0.35)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isUnread && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
          <span style={{ fontWeight: isUnread ? 700 : 600, fontSize: '0.9rem' }}>{m.sender?.full_name || 'Unknown'}</span>
        </div>
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