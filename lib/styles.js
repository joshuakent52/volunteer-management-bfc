export const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.5rem',
}

export const inputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '0.95rem',
  outline: 'none',
  fontFamily: 'DM Sans, sans-serif',
}

export const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  color: 'var(--muted)',
  marginBottom: '0.4rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

export const affiliationColor = {
  missionary: '#818cf8',
  student: '#38bdf8',
  volunteer: '#02416B',
  provider: '#7dd3fc',
}

export const badgeStyle = (color) => ({
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: '100px',
  fontSize: '0.75rem',
  fontWeight: 500,
  background: color + '22',
  color: color,
  border: `1px solid ${color}55`,
})

export const pillBtn = (active, mono) => ({
  padding: '0.45rem 0.85rem',
  borderRadius: '8px',
  fontSize: '0.8rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif',
  background: active ? (mono ? '#1e40af' : 'var(--accent)') : 'var(--surface)',
  color: active ? (mono ? '#bfdbfe' : '#0a0f0a') : 'var(--muted)',
  border: active ? 'none' : '1px solid var(--border)',
})
