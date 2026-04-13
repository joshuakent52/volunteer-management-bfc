'use client'

import { useState } from 'react'

const CREDENTIAL_FIELDS = [
  { key: 'license_exp', shortLabel: 'License'  },
  { key: 'bls_exp',     shortLabel: 'BLS'      },
  { key: 'dea_exp',     shortLabel: 'DEA'      },
  { key: 'ftca_exp',    shortLabel: 'FTCA'     },
  { key: 'tb_exp',      shortLabel: 'TB'       },
]

function credentialStatus(dateStr) {
  if (!dateStr) return 'missing'
  const exp = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  const oneMonthOut = new Date()
  oneMonthOut.setMonth(oneMonthOut.getMonth() + 1)
  if (exp < now) return 'expired'
  if (exp <= oneMonthOut) return 'expiring'
  return 'ok'
}

function formatExpDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

export default function ProviderCredentialsBanner({ profile }) {
  const [collapsed, setCollapsed] = useState(false)

  if (profile?.affiliation !== 'provider') return null

  const fields = CREDENTIAL_FIELDS.map(f => ({
    ...f,
    value: profile[f.key] || null,
    status: credentialStatus(profile[f.key]),
  }))

  const missingOrExpired = fields.filter(f => f.status === 'missing' || f.status === 'expired')
  const expiringSoon     = fields.filter(f => f.status === 'expiring')
  const allOk            = missingOrExpired.length === 0 && expiringSoon.length === 0

  const borderColor = missingOrExpired.length > 0 ? 'rgba(239,68,68,0.4)' : expiringSoon.length > 0 ? 'rgba(251,146,60,0.4)' : 'rgba(2,65,107,0.35)'
  const bgColor     = missingOrExpired.length > 0 ? 'rgba(239,68,68,0.04)' : expiringSoon.length > 0 ? 'rgba(251,146,60,0.04)' : 'rgba(2,65,107,0.03)'
  const headerColor = missingOrExpired.length > 0 ? '#ef4444' : expiringSoon.length > 0 ? '#f97316' : 'var(--accent)'

  return (
    <div style={{ borderRadius: '12px', border: `1px solid ${borderColor}`, background: bgColor, overflow: 'hidden' }}>
      {/* Header / toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '100px', background: `${headerColor}18`, color: headerColor, border: `1px solid ${headerColor}44` }}>
            Provider Credentials
          </span>
          <span style={{ fontSize: '0.82rem', color: headerColor, fontWeight: 500 }}>
            {allOk
              ? 'All credentials up to date'
              : missingOrExpired.length > 0
                ? `${missingOrExpired.length} credential${missingOrExpired.length !== 1 ? 's' : ''} require${missingOrExpired.length === 1 ? 's' : ''} attention`
                : `${expiringSoon.length} expiring soon`}
          </span>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>

      {/* Collapsible body */}
      {!collapsed && (
        <div style={{ padding: '0 1.25rem 1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.6rem' }}>
            {fields.map(f => {
              const isMissing  = f.status === 'missing'
              const isExpired  = f.status === 'expired'
              const isExpiring = f.status === 'expiring'

              const chipBorder = (isMissing || isExpired) ? 'rgba(239,68,68,0.45)' : isExpiring ? 'rgba(251,146,60,0.5)' : 'rgba(2,65,107,0.3)'
              const chipBg     = (isMissing || isExpired) ? 'rgba(239,68,68,0.07)' : isExpiring ? 'rgba(251,146,60,0.07)' : 'rgba(2,65,107,0.06)'
              const dateColor  = (isMissing || isExpired) ? '#ef4444' : isExpiring ? '#f97316' : 'var(--text)'
              const iconColor  = (isMissing || isExpired) ? '#ef4444' : isExpiring ? '#f97316' : '#22c55e'
              const icon       = (isMissing || isExpired) ? '✗' : isExpiring ? '!' : '✓'

              return (
                <div key={f.key} style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: `1px solid ${chipBorder}`, background: chipBg }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{f.shortLabel}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: iconColor }}>{icon}</span>
                  </div>
                  <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: isMissing ? 400 : 600, fontFamily: isMissing ? 'DM Sans, sans-serif' : 'DM Mono, monospace', color: dateColor, fontStyle: isMissing ? 'italic' : 'normal' }}>
                    {isMissing ? 'Not on file' : formatExpDate(f.value)}
                  </span>
                  {isExpired  && <span style={{ display: 'block', fontSize: '0.65rem', color: '#ef4444', fontWeight: 700, marginTop: '0.2rem' }}>EXPIRED</span>}
                  {isExpiring && <span style={{ display: 'block', fontSize: '0.65rem', color: '#f97316', fontWeight: 700, marginTop: '0.2rem' }}>EXP. SOON</span>}
                </div>
              )
            })}
          </div>

          {(missingOrExpired.length > 0 || expiringSoon.length > 0) && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>
              Please contact your admin to update your credentials on file.
            </p>
          )}
        </div>
      )}
    </div>
  )
}