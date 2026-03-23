'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://volunteer-management-bfc.vercel.app/reset-password',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)',
    fontSize: '0.95rem', outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '1rem',
    }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 0.3,
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: '400px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '2.5rem',
        boxShadow: '0 0 60px rgba(74,222,128,0.05)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo.jpg"
            alt="Logo"
            style={{ width: '120px', height: 'auto', display: 'block', margin: '0 auto 1rem', borderRadius: '12px' }}
          />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Reset Password
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {submitted
              ? 'Check your email for a reset link.'
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {submitted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'rgba(74,222,128,0.08)', border: '1px solid var(--accent)',
              borderRadius: '8px', padding: '0.75rem 1rem',
              color: 'var(--accent)', fontSize: '0.875rem', textAlign: 'center',
            }}>
              Email sent to <strong>{email}</strong>. Follow the link to reset your password. Check your spam folder if you don't see it.
            </div>
            <a href="/" style={{
              display: 'block', textAlign: 'center',
              color: 'var(--muted)', fontSize: '0.875rem',
              textDecoration: 'none', marginTop: '0.5rem',
            }}>
              ← Back to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--muted)',
                marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(248,113,113,0.1)', border: '1px solid var(--danger)',
                borderRadius: '8px', padding: '0.75rem 1rem',
                color: 'var(--danger)', fontSize: '0.875rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.85rem',
                background: loading ? 'var(--accent-dim)' : 'var(--accent)',
                color: '#0a0f0a', fontWeight: 600,
                border: 'none', borderRadius: '8px',
                fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <a href="/" style={{
              display: 'block', textAlign: 'center',
              color: 'var(--muted)', fontSize: '0.875rem',
              textDecoration: 'none',
            }}>
              ← Back to sign in
            </a>
          </form>
        )}
      </div>
    </div>
  )
}