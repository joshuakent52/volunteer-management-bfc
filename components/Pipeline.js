'use client'
import { useState, useEffect } from 'react'
import { ROLES, SCHOOLS, MAJORS } from '../lib/constants'

const STAGES = ['applied', 'interview', 'onboarding', 'rejected']

const STAGE_LABELS = {
  applied: 'Applied',
  interview: 'Interview',
  onboarding: 'Onboarding',
  rejected: 'Rejected',
}

const STAGE_COLORS = {
  applied: '#60a5fa',
  interview: '#f59e0b',
  onboarding: '#a78bfa',
  rejected: '#ef4444',
}

const AFFILIATION_OPTIONS = [
  { value: 'missionary', label: 'Missionary' },
  { value: 'student', label: 'Student' },
  { value: 'intern', label: 'Intern' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'provider', label: 'Provider' },
]

export default function Pipeline({ supabase, profile, onVolunteerCreated }) {
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [activeStageFilter, setActiveStageFilter] = useState('all')
  const [toast, setToast] = useState(null)

  // Onboarding form state
  const [onboardForm, setOnboardForm] = useState({
    affiliation: '',
    school: '',
    major: '',
    sma_name: '',
    sma_contact: '',
    advisor_name: '',
    advisor_contact: '',
    intern_school: '',
    intern_department: '',
    default_role: '',
  })
  const [onboardStep, setOnboardStep] = useState(1) // 1, 2, 3
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [movingStage, setMovingStage] = useState(false)

  useEffect(() => { loadApplicants() }, [])

  async function loadApplicants() {
    setLoading(true)
    const { data } = await supabase
      .from('volunteer_applications')
      .select('*')
      .order('created_at', { ascending: false })
    setApplicants(data || [])
    setLoading(false)
  }

  function showMessage(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function audit(action, target_type, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({
        admin_id: profile.id, action, target_type,
        target_id: target_id ? String(target_id) : null,
        target_name: target_name || null,
        details: details || null,
      })
    } catch (e) { console.error('audit log failed:', e) }
  }

  async function moveToStage(applicant, stage) {
    setMovingStage(true)
    const { error } = await supabase
      .from('volunteer_applications')
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq('id', applicant.id)
    if (error) { showMessage(error.message, 'error') }
    else {
      showMessage(`Moved to ${STAGE_LABELS[stage]}`, 'success')
      await audit(`pipeline_${stage}`, 'applicant', applicant.id, applicant.full_name, stage)
      await loadApplicants()
      setSelected(prev => prev?.id === applicant.id ? { ...prev, stage } : prev)
    }
    setMovingStage(false)
  }

  async function handleCreateProfile() {
    if (!selected) return
    setCreatingProfile(true)

    const isStudent = onboardForm.affiliation === 'student'
    const isMission = onboardForm.affiliation === 'missionary'
    const isIntern  = onboardForm.affiliation === 'intern'

    // Create auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: selected.email,
      password: 'BFC2025!',
    })
    if (authErr) { showMessage(authErr.message, 'error'); setCreatingProfile(false); return }

    // Build profile payload from application + onboarding
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: authData.user.id,
      full_name: selected.full_name,
      email: selected.email,
      phone: selected.phone || null,
      role: 'volunteer',
      affiliation: onboardForm.affiliation || null,
      languages: selected.languages || null,
      credentials: selected.credentials || null,
      default_role: onboardForm.default_role || null,
      birthday: selected.date_of_birth || null,
      // affiliation-conditional fields
      school:       isStudent ? (onboardForm.school || null) : null,
      major:        isStudent ? (onboardForm.major || null) : null,
      sma_name:     isMission ? (onboardForm.sma_name || null) : null,
      sma_contact:  isMission ? (onboardForm.sma_contact || null) : null,
      advisor_name:      isIntern ? (onboardForm.advisor_name || null) : null,
      advisor_contact:   isIntern ? (onboardForm.advisor_contact || null) : null,
      intern_school:     isIntern ? (onboardForm.intern_school || null) : null,
      intern_department: isIntern ? (onboardForm.intern_department || null) : null,
      status: 'active',
    })

    if (profileErr) { showMessage(profileErr.message, 'error'); setCreatingProfile(false); return }

    // Mark applicant as completed
    await supabase.from('volunteer_applications').update({ stage: 'completed', volunteer_id: authData.user.id }).eq('id', selected.id)
    await audit('created_volunteer', 'volunteer', authData.user.id, selected.full_name, 'from pipeline')

    showMessage(`Volunteer profile created for ${selected.full_name}!`, 'success')
    if (onVolunteerCreated) onVolunteerCreated()
    setSelected(null)
    setOnboardStep(1)
    setOnboardForm({ affiliation: '', school: '', major: '', sma_name: '', sma_contact: '', advisor_name: '', advisor_contact: '', intern_school: '', intern_department: '', default_role: '' })
    await loadApplicants()
    setCreatingProfile(false)
  }

  const filteredApplicants = activeStageFilter === 'all'
    ? applicants.filter(a => a.stage !== 'completed')
    : applicants.filter(a => a.stage === activeStageFilter)

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = applicants.filter(a => a.stage === s).length
    return acc
  }, {})

  // ── Styles ──
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  function StagePill({ stage }) {
    const color = STAGE_COLORS[stage] || '#94a3b8'
    return (
      <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '100px', fontWeight: 600, background: color + '18', color, border: `1px solid ${color}44` }}>
        {STAGE_LABELS[stage] || stage}
      </span>
    )
  }

  // ── Detail panel ──
  function ApplicantDetail({ applicant }) {
    const isInterview  = applicant.stage === 'interview'
    const isOnboarding = applicant.stage === 'onboarding'
    const isApplied    = applicant.stage === 'applied'

    const fields = [
      { label: 'Email', value: applicant.email },
      { label: 'Phone', value: applicant.phone },
      { label: 'Date of Birth', value: applicant.date_of_birth },
      { label: 'Languages', value: applicant.languages },
      { label: 'Credentials', value: applicant.credentials },
      { label: 'Skills', value: applicant.skills },
      { label: 'Education', value: applicant.educational_background },
      { label: 'Start Date', value: applicant.start_date },
      { label: 'Reference 1', value: applicant.ref1_name ? `${applicant.ref1_name} — ${applicant.ref1_contact}` : null },
      { label: 'Reference 2', value: applicant.ref2_name ? `${applicant.ref2_name} — ${applicant.ref2_contact}` : null },
      { label: 'Resume', value: applicant.resume_url },
    ].filter(f => f.value)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent)', flexShrink: 0 }}>
              {applicant.full_name?.charAt(0)}
            </div>
            <div>
              <h3 style={{ fontWeight: 600, fontSize: '1.1rem' }}>{applicant.full_name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <StagePill stage={applicant.stage} />
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Applied {applicant.created_at ? new Date(applicant.created_at).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => { setSelected(null); setOnboardStep(1) }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}
          >
            ← Back
          </button>
        </div>

        {/* Application fields */}
        <div style={{ ...card, padding: '1rem 1.25rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.85rem' }}>Application</p>
          {fields.length === 0
            ? <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>No application data on file.</p>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {fields.map(f => (
                  <div key={f.label} style={{ padding: '0.65rem 0.9rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', gridColumn: f.value?.length > 80 ? '1 / -1' : undefined }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{f.label}</p>
                    <p style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{f.value}</p>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Stage actions */}
        {(isApplied || isInterview) && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: STAGE_COLORS.interview + '44', background: STAGE_COLORS.interview + '06' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: STAGE_COLORS.interview, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.85rem' }}>Interview Decision</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Review the application above. Once you've interviewed this applicant, accept them to move to onboarding or reject their application.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {isApplied && (
                <button
                  onClick={() => moveToStage(applicant, 'interview')}
                  disabled={movingStage}
                  style={{ padding: '0.6rem 1.25rem', background: STAGE_COLORS.interview + '18', color: STAGE_COLORS.interview, border: `1px solid ${STAGE_COLORS.interview}55`, borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}
                >
                  → Move to Interview
                </button>
              )}
              {isInterview && (
                <>
                  <button
                    onClick={() => moveToStage(applicant, 'onboarding')}
                    disabled={movingStage}
                    style={{ padding: '0.6rem 1.25rem', background: 'rgba(2,65,107,0.12)', color: 'var(--accent)', border: '1px solid rgba(2,65,107,0.4)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}
                  >
                    ✓ Accept — Move to Onboarding
                  </button>
                  <button
                    onClick={() => moveToStage(applicant, 'rejected')}
                    disabled={movingStage}
                    style={{ padding: '0.6rem 1.25rem', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}
                  >
                    ✕ Reject Application
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Onboarding flow */}
        {isOnboarding && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: STAGE_COLORS.onboarding + '44', background: STAGE_COLORS.onboarding + '06' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: STAGE_COLORS.onboarding, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Onboarding — Step {onboardStep} of 3
              </p>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {[1, 2, 3].map(s => (
                  <div
                    key={s}
                    style={{ width: 28, height: 6, borderRadius: 3, background: s <= onboardStep ? STAGE_COLORS.onboarding : 'var(--border)', transition: 'background 0.2s' }}
                  />
                ))}
              </div>
            </div>

            {/* Step 1: Affiliation */}
            {onboardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>What is their affiliation?</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                  {AFFILIATION_OPTIONS.map(opt => {
                    const active = onboardForm.affiliation === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setOnboardForm(f => ({ ...f, affiliation: opt.value }))}
                        style={{
                          padding: '0.75rem 1rem', borderRadius: '10px', border: `1px solid ${active ? STAGE_COLORS.onboarding : 'var(--border)'}`,
                          background: active ? STAGE_COLORS.onboarding + '18' : 'var(--bg)',
                          color: active ? STAGE_COLORS.onboarding : 'var(--text)',
                          fontWeight: active ? 600 : 400, cursor: 'pointer',
                          fontFamily: 'DM Sans, sans-serif', fontSize: '0.88rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setOnboardStep(2)}
                  disabled={!onboardForm.affiliation}
                  style={{ alignSelf: 'flex-start', padding: '0.65rem 1.5rem', background: onboardForm.affiliation ? STAGE_COLORS.onboarding : 'var(--surface)', color: onboardForm.affiliation ? '#fff' : 'var(--muted)', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: onboardForm.affiliation ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem', opacity: onboardForm.affiliation ? 1 : 0.5 }}
                >
                  Next →
                </button>
              </div>
            )}

            {/* Step 2: Affiliation-specific fields */}
            {onboardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  {onboardForm.affiliation === 'student' && 'School & Major'}
                  {onboardForm.affiliation === 'missionary' && 'Mission Information'}
                  {onboardForm.affiliation === 'intern' && 'Internship Details'}
                  {(onboardForm.affiliation === 'volunteer' || onboardForm.affiliation === 'provider') && 'Additional Info'}
                </p>

                {onboardForm.affiliation === 'student' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div>
                      <label style={labelStyle}>School</label>
                      <select value={onboardForm.school} onChange={e => setOnboardForm(f => ({ ...f, school: e.target.value }))} style={inputStyle}>
                        <option value="">— Select —</option>
                        {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Major</label>
                      <select value={onboardForm.major} onChange={e => setOnboardForm(f => ({ ...f, major: e.target.value }))} style={inputStyle}>
                        <option value="">— Select —</option>
                        {MAJORS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {onboardForm.affiliation === 'missionary' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div>
                      <label style={labelStyle}>SMA Name</label>
                      <input value={onboardForm.sma_name} onChange={e => setOnboardForm(f => ({ ...f, sma_name: e.target.value }))} placeholder="SMA full name" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>SMA Contact</label>
                      <input value={onboardForm.sma_contact} onChange={e => setOnboardForm(f => ({ ...f, sma_contact: e.target.value }))} placeholder="Phone or email" style={inputStyle} />
                    </div>
                  </div>
                )}

                {onboardForm.affiliation === 'intern' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div>
                      <label style={labelStyle}>Advisor Name</label>
                      <input value={onboardForm.advisor_name} onChange={e => setOnboardForm(f => ({ ...f, advisor_name: e.target.value }))} placeholder="Advisor full name" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Advisor Contact</label>
                      <input value={onboardForm.advisor_contact} onChange={e => setOnboardForm(f => ({ ...f, advisor_contact: e.target.value }))} placeholder="Phone or email" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>School / Institution</label>
                      <input value={onboardForm.intern_school} onChange={e => setOnboardForm(f => ({ ...f, intern_school: e.target.value }))} placeholder="University or institution" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Dept / Company</label>
                      <input value={onboardForm.intern_department} onChange={e => setOnboardForm(f => ({ ...f, intern_department: e.target.value }))} placeholder="Department or company" style={inputStyle} />
                    </div>
                  </div>
                )}

                {(onboardForm.affiliation === 'volunteer' || onboardForm.affiliation === 'provider') && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>No additional affiliation-specific info required.</p>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => setOnboardStep(1)} style={{ padding: '0.65rem 1.25rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>← Back</button>
                  <button onClick={() => setOnboardStep(3)} style={{ padding: '0.65rem 1.5rem', background: STAGE_COLORS.onboarding, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>Next →</button>
                </div>
              </div>
            )}

            {/* Step 3: Default position */}
            {onboardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Default Position</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>Select the position this volunteer will most commonly fill. They can change this later.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem' }}>
                  {ROLES.map(role => {
                    const active = onboardForm.default_role === role
                    return (
                      <button
                        key={role}
                        onClick={() => setOnboardForm(f => ({ ...f, default_role: role }))}
                        style={{
                          padding: '0.65rem 0.9rem', borderRadius: '10px',
                          border: `1px solid ${active ? STAGE_COLORS.onboarding : 'var(--border)'}`,
                          background: active ? STAGE_COLORS.onboarding + '18' : 'var(--bg)',
                          color: active ? STAGE_COLORS.onboarding : 'var(--text)',
                          fontWeight: active ? 600 : 400, cursor: 'pointer',
                          fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem',
                          textAlign: 'left', transition: 'all 0.15s',
                        }}
                      >
                        {role}
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button onClick={() => setOnboardStep(2)} style={{ padding: '0.65rem 1.25rem', background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem' }}>← Back</button>
                  <button
                    onClick={handleCreateProfile}
                    disabled={creatingProfile || !onboardForm.default_role}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: (creatingProfile || !onboardForm.default_role) ? 'var(--surface)' : 'var(--accent)',
                      color: (creatingProfile || !onboardForm.default_role) ? 'var(--muted)' : '#0a0f0a',
                      border: 'none', borderRadius: '8px', fontWeight: 700, cursor: (creatingProfile || !onboardForm.default_role) ? 'not-allowed' : 'pointer',
                      fontFamily: 'DM Sans, sans-serif', fontSize: '0.9rem', opacity: !onboardForm.default_role ? 0.5 : 1,
                    }}
                  >
                    {creatingProfile ? 'Creating...' : '✓ Create Volunteer Profile'}
                  </button>
                </div>

                {onboardForm.default_role && !creatingProfile && (
                  <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: 'rgba(2,65,107,0.05)', border: '1px solid rgba(2,65,107,0.25)' }}>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Profile Summary</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {[
                        { label: 'Name', value: selected.full_name },
                        { label: 'Email', value: selected.email },
                        { label: 'Affiliation', value: onboardForm.affiliation },
                        { label: 'Position', value: onboardForm.default_role },
                        ...(onboardForm.school ? [{ label: 'School', value: onboardForm.school }] : []),
                        ...(onboardForm.sma_name ? [{ label: 'SMA', value: onboardForm.sma_name }] : []),
                      ].map(item => (
                        <div key={item.label} style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.label}: </span>{item.value}
                        </div>
                      ))}
                      <div style={{ padding: '0.3rem 0.75rem', borderRadius: '100px', background: 'rgba(2,65,107,0.1)', border: '1px solid rgba(2,65,107,0.35)', fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Password: </span>
                        <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--accent)', fontWeight: 600 }}>BFC2025!</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rejected state */}
        {applicant.stage === 'rejected' && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.04)' }}>
            <p style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 500 }}>This applicant has been rejected.</p>
          </div>
        )}
      </div>
    )
  }

  // ── List view ──
  if (selected) {
    return (
      <div style={{ position: 'relative' }}>
        <ApplicantDetail applicant={selected} />
        {toast && (
          <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: toast.type === 'success' ? '#0a0f0a' : '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100 }}>
            {toast.text}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Stage filter bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveStageFilter('all')}
          style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: activeStageFilter === 'all' ? 'var(--accent)' : 'var(--surface)', color: activeStageFilter === 'all' ? '#0a0f0a' : 'var(--muted)', border: activeStageFilter === 'all' ? 'none' : '1px solid var(--border)' }}
        >
          All <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem' }}>({applicants.filter(a => a.stage !== 'completed').length})</span>
        </button>
        {STAGES.map(stage => {
          const color = STAGE_COLORS[stage]
          const active = activeStageFilter === stage
          return (
            <button
              key={stage}
              onClick={() => setActiveStageFilter(stage)}
              style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: active ? color + '18' : 'var(--surface)', color: active ? color : 'var(--muted)', border: active ? `1px solid ${color}55` : '1px solid var(--border)' }}
            >
              {STAGE_LABELS[stage]} <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem' }}>({stageCounts[stage]})</span>
            </button>
          )
        })}
      </div>

      {/* Applicant list */}
      <div style={card}>
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading applicants...</p>
        ) : filteredApplicants.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No applicants in this stage.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {filteredApplicants.map(a => (
              <div
                key={a.id}
                onClick={() => { setSelected(a); setOnboardStep(1); setOnboardForm({ affiliation: '', school: '', major: '', sma_name: '', sma_contact: '', advisor_name: '', advisor_contact: '', intern_school: '', intern_department: '', default_role: '' }) }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--accent)', fontSize: '0.95rem', flexShrink: 0 }}>
                    {a.full_name?.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{a.full_name}</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{a.email}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <StagePill stage={a.stage} />
                  {a.created_at && <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{new Date(a.created_at).toLocaleDateString()}</span>}
                  <span style={{ color: 'var(--muted)' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? 'var(--accent)' : 'var(--danger)', color: toast.type === 'success' ? '#0a0f0a' : '#fff', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100 }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
