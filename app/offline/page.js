export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '2.5rem' }}>📡</p>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
        No Connection
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', maxWidth: '280px', lineHeight: 1.6 }}>
        You're offline. Please check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: '0.5rem',
          padding: '0.75rem 1.5rem',
          background: 'var(--accent)',
          color: '#0a0f0a',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '0.9rem',
          cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        Try Again
      </button>
    </div>
  )
}
