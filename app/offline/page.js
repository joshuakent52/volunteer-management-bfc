export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column',
      gap: '0.5rem', textAlign: 'center', padding: '2rem'
    }}>
      <h1 style={{ color: 'var(--text)', fontWeight: 600 }}>You're offline</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Check your connection and try again.
      </p>
    </div>
  )
}