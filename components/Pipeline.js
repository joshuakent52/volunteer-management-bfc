'use client'
import { useState, useEffect, useRef } from 'react'
import { ROLES, SCHOOLS, MAJORS } from '../lib/constants'

const STAGES = ['applied', 'interview', 'onboarding', 'rejected']

const STAGE_LABELS = {
  applied:    'Applied',
  interview:  'Interview',
  onboarding: 'Onboarding',
  rejected:   'Rejected',
}

const C = {
  blue:   '#3b82f6',
  yellow: '#f59e0b',
  red:    '#ef4444',
  green:  '#22c55e',
}

const STAGE_COLORS = {
  applied:    C.blue,
  interview:  C.yellow,
  onboarding: C.blue,
  rejected:   C.red,
}

const AFFILIATION_OPTIONS = [
  { value: 'missionary', label: 'Missionary' },
  { value: 'student',    label: 'Student' },
  { value: 'intern',     label: 'Intern' },
  { value: 'volunteer',  label: 'Volunteer' },
  { value: 'provider',   label: 'Provider' },
]

const PROVIDER_CRED_FIELDS = [
  { key: 'license_exp', label: 'License' },
  { key: 'bls_exp',     label: 'BLS' },
  { key: 'dea_exp',     label: 'DEA', allowNA: true },
  { key: 'ftca_exp',    label: 'FTCA' },
  { key: 'tb_exp',      label: 'TB' },
]

// Checklist items. mandatory = true means the checkbox is visually marked as required.
const CHECKLIST_ITEMS = [
  { key: 'background_check',          label: 'Background Check',          mandatory: true,  bucket: 'onboarding-background-checks', urlKey: 'background_check_url' },
  { key: 'id_check',                  label: 'ID',                        mandatory: true,  bucket: 'onboarding-ids',               urlKey: 'id_check_url' },
  { key: 'immunization',              label: 'Immunization',              mandatory: true,  bucket: 'onboarding-immunizations',     urlKey: 'immunization_url' },
  { key: 'tb_test',                   label: 'TB Test',                   mandatory: true,  bucket: 'onboarding-tb-tests',          urlKey: 'tb_test_url' },
  { key: 'confidentiality_agreement', label: 'Confidentiality Agreement', mandatory: false, bucket: 'onboarding-confidentiality',   urlKey: 'confidentiality_url' },
  { key: 'welcome_packet',            label: 'Welcome Packet',            mandatory: true,  bucket: null,                           urlKey: null },
  { key: 'parking_pass',              label: 'Parking Pass',              mandatory: false, bucket: 'onboarding-parking-passes',    urlKey: 'parking_pass_url' },
]

const TOTAL_STEPS = 4

export default function Pipeline({ supabase, profile, onVolunteerCreated }) {
  const [applicants, setApplicants]       = useState([])
  const [loading, setLoading]             = useState(true)
  const [loadError, setLoadError]         = useState(null)
  const [selected, setSelected]           = useState(null)
  const [activeStageFilter, setActiveStageFilter] = useState('applied')
  const [toast, setToast]                 = useState(null)
  const [movingStage, setMovingStage]     = useState(false)

  // Interview
  const [interviewDate, setInterviewDate] = useState('')
  const [interviewTime, setInterviewTime] = useState('')
  const [savingInterview, setSavingInterview] = useState(false)

  // Onboarding form — 4 independent steps
  const EMPTY_FORM = {
    affiliation:       '',
    sma_name:          '',
    sma_contact:       '',
    school:            '',
    major:             '',
    intern_school:     '',
    intern_department: '',
    advisor_name:      '',
    advisor_contact:   '',
    credentials:       '',
    // Provider credential expiration dates
    license_exp:       '',
    bls_exp:           '',
    dea_exp:           '',
    ftca_exp:          '',
    tb_exp:            '',
    birthday:          '',
    default_role:      '',
  }
  const [onboardForm, setOnboardForm]     = useState(EMPTY_FORM)
  const [onboardStep, setOnboardStep]     = useState(1)
  const [creatingProfile, setCreatingProfile] = useState(false)

  // Checklist
  const EMPTY_CHECKLIST = {
    confidentiality_agreement: false,
    tb_test:                   false,
    background_check:          false,
    welcome_packet:            false,
    parking_pass:              false,
    id_check:                  false,
    immunization:              false,
    // File URLs
    background_check_url:      null,
    id_check_url:              null,
    confidentiality_url:       null,
    immunization_url:          null,
    tb_test_url:               null,
    parking_pass_url:          null,
  }
  const [checklist, setChecklist]         = useState(EMPTY_CHECKLIST)
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [uploadingKey, setUploadingKey]   = useState(null)

  useEffect(() => { loadApplicants() }, [])

  async function loadApplicants() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('volunteer_applications')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Load error:', error)
      setLoadError(error.message)
      setApplicants([])
    } else {
      setApplicants(data || [])
    }
    setLoading(false)
  }

  async function loadChecklist(applicantId) {
    const { data } = await supabase
      .from('onboarding_checklists')
      .select('*')
      .eq('applicant_id', applicantId)
      .maybeSingle()
    if (data) {
      setChecklist({
        confidentiality_agreement: data.confidentiality_agreement ?? false,
        tb_test:                   data.tb_test ?? false,
        background_check:          data.background_check ?? false,
        welcome_packet:            data.welcome_packet ?? false,
        parking_pass:              data.parking_pass ?? false,
        id_check:                  data.id_check ?? false,
        immunization:              data.immunization ?? false,
        background_check_url:      data.background_check_url ?? null,
        id_check_url:              data.id_check_url ?? null,
        confidentiality_url:       data.confidentiality_url ?? null,
        immunization_url:          data.immunization_url ?? null,
        tb_test_url:               data.tb_test_url ?? null,
        parking_pass_url:          data.parking_pass_url ?? null,
      })
    } else {
      setChecklist(EMPTY_CHECKLIST)
    }
  }

  function showMessage(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function audit(action, target_type, target_id, target_name, details) {
    try {
      await supabase.from('audit_logs').insert({
        admin_id: profile.id, action, target_type,
        target_id:   target_id   ? String(target_id) : null,
        target_name: target_name || null,
        details:     details     || null,
      })
    } catch (e) { console.error('audit failed:', e) }
  }

  async function moveToStage(applicant, stage) {
    setMovingStage(true)
    const { error } = await supabase
      .from('volunteer_applications')
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq('id', applicant.id)
    if (error) {
      showMessage(error.message, 'error')
    } else {
      showMessage(`Moved to ${STAGE_LABELS[stage]}`)
      await audit(`pipeline_${stage}`, 'applicant', applicant.id, applicant.full_name, stage)
      await loadApplicants()
      setSelected(prev => prev?.id === applicant.id ? { ...prev, stage } : prev)
    }
    setMovingStage(false)
  }

  async function saveInterviewTime(applicant) {
    if (!interviewDate) return
    setSavingInterview(true)
    const iso = interviewTime
      ? new Date(`${interviewDate}T${interviewTime}`).toISOString()
      : new Date(`${interviewDate}T00:00`).toISOString()
    const { error } = await supabase
      .from('volunteer_applications')
      .update({ interview_scheduled_at: iso })
      .eq('id', applicant.id)
    if (error) {
      showMessage(error.message, 'error')
    } else {
      showMessage('Interview scheduled')
      await loadApplicants()
      setSelected(prev => prev?.id === applicant.id
        ? { ...prev, interview_scheduled_at: iso } : prev)
    }
    setSavingInterview(false)
  }

  async function toggleChecklistItem(applicantId, key, value) {
    setSavingChecklist(true)
    const next = { ...checklist, [key]: value }
    setChecklist(next)
    const { error } = await supabase
      .from('onboarding_checklists')
      .upsert({
        applicant_id:              applicantId,
        confidentiality_agreement: next.confidentiality_agreement,
        tb_test:                   next.tb_test,
        background_check:          next.background_check,
        welcome_packet:            next.welcome_packet,
        parking_pass:              next.parking_pass,
        id_check:                  next.id_check,
        immunization:              next.immunization,
        background_check_url:      next.background_check_url,
        id_check_url:              next.id_check_url,
        confidentiality_url:       next.confidentiality_url,
        immunization_url:          next.immunization_url,
        tb_test_url:               next.tb_test_url,
        parking_pass_url:          next.parking_pass_url,
        updated_at:                new Date().toISOString(),
      }, { onConflict: 'applicant_id' })
    if (error) {
      showMessage(error.message, 'error')
      setChecklist(checklist)
    }
    setSavingChecklist(false)
  }

  async function handleFileUpload(applicantId, item, file) {
    if (!file || !item.bucket || !item.urlKey) return
    setUploadingKey(item.key)
    try {
      const ext      = file.name.split('.').pop()
      const path     = `${applicantId}/${item.key}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(item.bucket)
        .upload(path, file, { upsert: true })
      if (upErr) { showMessage(upErr.message, 'error'); setUploadingKey(null); return }

      const next = { ...checklist, [item.urlKey]: path }
      setChecklist(next)
      const { error: dbErr } = await supabase
        .from('onboarding_checklists')
        .upsert({
          applicant_id:              applicantId,
          confidentiality_agreement: next.confidentiality_agreement,
          tb_test:                   next.tb_test,
          background_check:          next.background_check,
          welcome_packet:            next.welcome_packet,
          parking_pass:              next.parking_pass,
          id_check:                  next.id_check,
          immunization:              next.immunization,
          background_check_url:      next.background_check_url,
          id_check_url:              next.id_check_url,
          confidentiality_url:       next.confidentiality_url,
          immunization_url:          next.immunization_url,
          tb_test_url:               next.tb_test_url,
          parking_pass_url:          next.parking_pass_url,
          updated_at:                new Date().toISOString(),
        }, { onConflict: 'applicant_id' })
      if (dbErr) showMessage(dbErr.message, 'error')
      else showMessage(`${item.label} uploaded`)
    } catch (e) {
      showMessage(e.message, 'error')
    }
    setUploadingKey(null)
  }

  async function openFile(bucket, storagePath) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 120)
    if (error) { showMessage('Could not open file', 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function openResume(resumeUrl) {
    if (!resumeUrl) return
    const { data, error } = await supabase.storage
      .from('resumes')
      .createSignedUrl(resumeUrl, 60)
    if (error) { showMessage('Could not load resume', 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function handleCreateProfile() {
    if (!selected) return
    const affil = onboardForm.affiliation
    if (!affil)                    { showMessage('Select an affiliation', 'error'); setOnboardStep(1); return }
    if (!onboardForm.birthday)     { showMessage('Birthday is required', 'error'); setOnboardStep(2); return }
    if (!onboardForm.default_role) { showMessage('Select a default position', 'error'); setOnboardStep(3); return }

    setCreatingProfile(true)

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: selected.email, password: 'BFC2025!',
    })
    if (authErr) { showMessage(authErr.message, 'error'); setCreatingProfile(false); return }

    const isProvider = affil === 'provider'

    const profilePayload = {
      id:           authData.user.id,
      full_name:    selected.full_name,
      email:        selected.email,
      phone:        selected.phone || null,
      role:         'volunteer',
      affiliation:  affil || null,
      languages:    selected.languages || null,
      default_role: onboardForm.default_role || null,
      birthday:     onboardForm.birthday || null,
      status:       'active',
      sma_name:     affil === 'missionary' ? (onboardForm.sma_name || null) : null,
      sma_contact:  affil === 'missionary' ? (onboardForm.sma_contact || null) : null,
      school:       affil === 'student'    ? (onboardForm.school || null) : null,
      major:        affil === 'student'    ? (onboardForm.major || null) : null,
      intern_school:     affil === 'intern' ? (onboardForm.intern_school || null) : null,
      intern_department: affil === 'intern' ? (onboardForm.intern_department || null) : null,
      advisor_name:      affil === 'intern' ? (onboardForm.advisor_name || null) : null,
      advisor_contact:   affil === 'intern' ? (onboardForm.advisor_contact || null) : null,
      credentials:  isProvider ? (onboardForm.credentials || null) : (selected.credentials || null),
      license_exp:  isProvider ? (onboardForm.license_exp || null) : null,
      bls_exp:      isProvider ? (onboardForm.bls_exp || null) : null,
      dea_exp:      isProvider ? (onboardForm.dea_exp || null) : null,
      ftca_exp:     isProvider ? (onboardForm.ftca_exp || null) : null,
      tb_exp:       isProvider ? (onboardForm.tb_exp || null) : null,
    }

    const { error: profileErr } = await supabase.from('profiles').insert(profilePayload)
    if (profileErr) { showMessage(profileErr.message, 'error'); setCreatingProfile(false); return }

    await supabase.from('volunteer_applications')
      .update({ stage: 'completed', volunteer_id: authData.user.id })
      .eq('id', selected.id)
    await audit('created_volunteer', 'volunteer', authData.user.id, selected.full_name, 'from pipeline')

    showMessage(`Profile created for ${selected.full_name}`)
    if (onVolunteerCreated) onVolunteerCreated()
    setSelected(null)
    setOnboardStep(1)
    setOnboardForm(EMPTY_FORM)
    setChecklist(EMPTY_CHECKLIST)
    await loadApplicants()
    setCreatingProfile(false)
  }

  function selectApplicant(a) {
    setSelected(a)
    setOnboardStep(1)
    setOnboardForm(EMPTY_FORM)
    setChecklist(EMPTY_CHECKLIST)
    setInterviewDate('')
    setInterviewTime('')
    if (a.stage === 'onboarding') loadChecklist(a.id)
    if (a.interview_scheduled_at) {
      const d = new Date(a.interview_scheduled_at)
      setInterviewDate(d.toISOString().slice(0, 10))
      setInterviewTime(d.toTimeString().slice(0, 5))
    }
  }

  const filteredApplicants = applicants.filter(a => a.stage === activeStageFilter)

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = applicants.filter(a => a.stage === s).length
    return acc
  }, {})

  // ── Shared styles ──
  const card = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '1.5rem',
  }
  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem',
    outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
    colorScheme: 'dark',
  }
  const labelStyle = {
    display: 'block', fontSize: '0.78rem', color: 'var(--muted)',
    marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em',
  }
  const sectionLabel = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem',
  }

  function btn(color, disabled) {
    return {
      padding: '0.65rem 1.35rem', borderRadius: '8px', border: 'none',
      background: disabled ? 'var(--surface)' : color,
      color: disabled ? 'var(--muted)' : (color === C.yellow ? '#1a1a00' : '#fff'),
      fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
      opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
    }
  }

  function outlineBtn(color) {
    return {
      padding: '0.65rem 1.35rem', borderRadius: '8px',
      border: `1px solid ${color}55`,
      background: color + '12', color,
      fontWeight: 600, cursor: 'pointer',
      fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
    }
  }

  function ghostBtn() {
    return {
      padding: '0.65rem 1.25rem', borderRadius: '8px',
      border: '1px solid var(--border)',
      background: 'var(--surface)', color: 'var(--muted)',
      fontWeight: 500, cursor: 'pointer',
      fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem',
    }
  }

  function StagePill({ stage }) {
    const color = STAGE_COLORS[stage] || '#94a3b8'
    return (
      <span style={{
        fontSize: '0.72rem', padding: '0.15rem 0.6rem', borderRadius: '100px',
        fontWeight: 600, background: color + '18', color,
        border: `1px solid ${color}44`,
      }}>
        {STAGE_LABELS[stage] || stage}
      </span>
    )
  }

  function StepDots({ current, total, color }) {
    return (
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            width: 28, height: 6, borderRadius: 3,
            background: i < current ? color : 'var(--border)',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
    )
  }

  // ── Provider credential input widget ──
  function CredentialInput({ fieldKey, label, value, onChange, allowNA }) {
    const mode = value === 'N/A' ? 'na' : value === 'expired' ? 'expired' : 'date'
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <select
            value={mode}
            onChange={e => {
              const m = e.target.value
              if (m === 'na') onChange('N/A')
              else if (m === 'expired') onChange('expired')
              else onChange('')
            }}
            style={{ ...inputStyle, fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
          >
            <option value="date">Set date</option>
            {allowNA && <option value="na">N/A</option>}
            <option value="expired">Mark expired</option>
          </select>
          {mode === 'date' && (
            <input
              type="date"
              value={value && value !== 'N/A' && value !== 'expired' ? value : ''}
              onChange={e => onChange(e.target.value)}
              style={{ ...inputStyle, fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Affiliation-specific extra fields ──
  function AffiliationExtras() {
    const affil = onboardForm.affiliation

    if (affil === 'missionary') {
      return (
        <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
          <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>Mission Service Assignment</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={labelStyle}>SMA Name</label>
              <input value={onboardForm.sma_name} onChange={e => setOnboardForm(f => ({ ...f, sma_name: e.target.value }))} placeholder="Full name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>SMA Contact</label>
              <input value={onboardForm.sma_contact} onChange={e => setOnboardForm(f => ({ ...f, sma_contact: e.target.value }))} placeholder="Phone or email" style={inputStyle} />
            </div>
          </div>
        </div>
      )
    }

    if (affil === 'student') {
      return (
        <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
          <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>Academic Information</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={labelStyle}>School <span style={{ color: C.red }}>*</span></label>
              <input value={onboardForm.school} onChange={e => setOnboardForm(f => ({ ...f, school: e.target.value }))} placeholder="University or college name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Major <span style={{ color: C.red }}>*</span></label>
              <input value={onboardForm.major} onChange={e => setOnboardForm(f => ({ ...f, major: e.target.value }))} placeholder="Field of study" style={inputStyle} />
            </div>
          </div>
        </div>
      )
    }

    if (affil === 'intern') {
      return (
        <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
          <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>Internship Details</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={labelStyle}>School <span style={{ color: C.red }}>*</span></label>
              <input value={onboardForm.intern_school} onChange={e => setOnboardForm(f => ({ ...f, intern_school: e.target.value }))} placeholder="University or college name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Department <span style={{ color: C.red }}>*</span></label>
              <input value={onboardForm.intern_department} onChange={e => setOnboardForm(f => ({ ...f, intern_department: e.target.value }))} placeholder="e.g. Nursing, Social Work" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Advisor Name <span style={{ color: C.red }}>*</span></label>
              <input value={onboardForm.advisor_name} onChange={e => setOnboardForm(f => ({ ...f, advisor_name: e.target.value }))} placeholder="Full name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Advisor Contact <span style={{ color: C.red }}>*</span></label>
              <input value={onboardForm.advisor_contact} onChange={e => setOnboardForm(f => ({ ...f, advisor_contact: e.target.value }))} placeholder="Phone or email" style={inputStyle} />
            </div>
          </div>
        </div>
      )
    }

    if (affil === 'provider') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Credentials / Licensure text */}
          <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid ${C.blue}33` }}>
            <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>Credentials / Licensure <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
            <input
              value={onboardForm.credentials}
              onChange={e => setOnboardForm(f => ({ ...f, credentials: e.target.value }))}
              placeholder="e.g. MD, NP, RN, PA — leave blank if not yet known"
              style={inputStyle}
            />
          </div>

          {/* Credential expiration dates */}
          <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: `1px solid rgba(125,211,252,0.35)` }}>
            <p style={{ ...sectionLabel, color: '#7dd3fc', marginBottom: '0.85rem' }}>Credential Expiration Dates <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
              {PROVIDER_CRED_FIELDS.map(f => (
                <CredentialInput
                  key={f.key}
                  fieldKey={f.key}
                  label={f.label}
                  value={onboardForm[f.key] || ''}
                  onChange={val => setOnboardForm(prev => ({ ...prev, [f.key]: val }))}
                  allowNA={!!f.allowNA}
                />
              ))}
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  function step1Valid() {
    const affil = onboardForm.affiliation
    if (!affil) return false
    if (affil === 'student')  return !!(onboardForm.school && onboardForm.major)
    if (affil === 'intern')   return !!(onboardForm.intern_school && onboardForm.intern_department && onboardForm.advisor_name && onboardForm.advisor_contact)
    return true
  }

  function profileSummaryItems() {
    const affil = onboardForm.affiliation
    const base = [
      { label: 'Name',        value: selected?.full_name },
      { label: 'Email',       value: selected?.email },
      { label: 'Affiliation', value: affil },
      { label: 'Birthday',    value: onboardForm.birthday },
      { label: 'Position',    value: onboardForm.default_role },
    ]
    if (affil === 'missionary' && onboardForm.sma_name)  base.push({ label: 'SMA', value: onboardForm.sma_name })
    if (affil === 'student') {
      if (onboardForm.school) base.push({ label: 'School', value: onboardForm.school })
      if (onboardForm.major)  base.push({ label: 'Major',  value: onboardForm.major })
    }
    if (affil === 'intern') {
      if (onboardForm.intern_school)     base.push({ label: 'School',     value: onboardForm.intern_school })
      if (onboardForm.intern_department) base.push({ label: 'Department', value: onboardForm.intern_department })
      if (onboardForm.advisor_name)      base.push({ label: 'Advisor',    value: onboardForm.advisor_name })
    }
    if (affil === 'provider' && onboardForm.credentials) base.push({ label: 'Credentials', value: onboardForm.credentials })
    return base
  }

  // ── File upload row sub-component ──
  function FileRow({ item, applicantId }) {
    const fileInputRef = useRef(null)
    const hasFile = !!(checklist[item.urlKey])
    const isUploading = uploadingKey === item.key
    if (!item.bucket || !item.urlKey) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFileUpload(applicantId, item, f)
            e.target.value = ''
          }}
        />
        {hasFile ? (
          <>
            <button
              onClick={() => openFile(item.bucket, checklist[item.urlKey])}
              style={{
                padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                background: C.blue + '14', color: C.blue,
                border: `1px solid ${C.blue}44`,
              }}
            >
              View File
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{
                padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem',
                fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                background: 'var(--surface)', color: 'var(--muted)',
                border: '1px solid var(--border)',
              }}
            >
              Replace
            </button>
          </>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{
              padding: '0.2rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem',
              fontWeight: 600, cursor: isUploading ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              background: 'var(--surface)', color: 'var(--muted)',
              border: '1px solid var(--border)',
              opacity: isUploading ? 0.5 : 1,
            }}
          >
            {isUploading ? 'Uploading...' : '+ Attach File'}
          </button>
        )}
      </div>
    )
  }

  // ── Detail panel ──
  function ApplicantDetail({ applicant }) {
    const isApplied    = applicant.stage === 'applied'
    const isInterview  = applicant.stage === 'interview'
    const isOnboarding = applicant.stage === 'onboarding'
    const isRejected   = applicant.stage === 'rejected'

    const existingDate = applicant.interview_scheduled_at
      ? new Date(applicant.interview_scheduled_at).toLocaleDateString([], { dateStyle: 'medium' })
      : null
    const existingTime = applicant.interview_scheduled_at
      ? new Date(applicant.interview_scheduled_at).toLocaleTimeString([], { timeStyle: 'short' })
      : null

    const fields = [
      { label: 'Email',       value: applicant.email },
      { label: 'Phone',       value: applicant.phone },
      { label: 'Languages',   value: applicant.languages },
      { label: 'Credentials', value: applicant.credentials },
      { label: 'Skills',      value: applicant.skills },
      { label: 'Education',   value: applicant.educational_background },
      { label: 'Start Date',  value: applicant.start_date },
      { label: 'Reference 1', value: applicant.ref1_name ? `${applicant.ref1_name} — ${applicant.ref1_contact}` : null },
      { label: 'Reference 2', value: applicant.ref2_name ? `${applicant.ref2_name} — ${applicant.ref2_contact}` : null },
    ].filter(f => f.value)

    const s1Valid    = step1Valid()
    const step2Valid = !!onboardForm.birthday
    const step3Valid = !!onboardForm.default_role
    const allStepsValid = s1Valid && step2Valid && step3Valid

    const checklistCount = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length
    const mandatoryItems = CHECKLIST_ITEMS.filter(i => i.mandatory)
    const mandatoryComplete = mandatoryItems.every(i => checklist[i.key])

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--bg)', border: `2px solid ${C.blue}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '1.2rem', color: C.blue, flexShrink: 0,
            }}>
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
            Back
          </button>
        </div>

        {/* ── Application fields ── */}
        <div style={{ ...card, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <p style={sectionLabel}>Application</p>
            {applicant.resume_url && (
              <button onClick={() => openResume(applicant.resume_url)} style={outlineBtn(C.blue)}>
                View Resume
              </button>
            )}
          </div>
          {fields.length === 0
            ? <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>No application data on file.</p>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {fields.map(f => (
                  <div key={f.label} style={{
                    padding: '0.65rem 0.9rem', background: 'var(--bg)',
                    borderRadius: '8px', border: '1px solid var(--border)',
                    gridColumn: (f.value?.length > 80) ? '1 / -1' : undefined,
                  }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{f.label}</p>
                    <p style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{f.value}</p>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* ── Applied stage ── */}
        {isApplied && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.yellow + '55', background: C.yellow + '06' }}>
            <p style={{ ...sectionLabel, color: C.yellow }}>Review</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Review this application and decide whether to schedule an interview or reject it.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => moveToStage(applicant, 'interview')} disabled={movingStage} style={outlineBtn(C.yellow)}>
                Move to Interview
              </button>
              <button onClick={() => moveToStage(applicant, 'rejected')} disabled={movingStage} style={outlineBtn(C.red)}>
                Reject Application
              </button>
            </div>
          </div>
        )}

        {/* ── Interview card ── */}
        {isInterview && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.yellow + '55', background: C.yellow + '06' }}>
            <p style={{ ...sectionLabel, color: C.yellow }}>Interview</p>

            <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
              <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>Schedule</p>
              {existingDate && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  marginBottom: '0.85rem', padding: '0.45rem 0.9rem',
                  borderRadius: '8px', background: C.yellow + '14', border: `1px solid ${C.yellow}44`,
                }}>
                  <span style={{ fontSize: '0.82rem', color: C.yellow, fontWeight: 600 }}>
                    {existingDate}{existingTime ? ` at ${existingTime}` : ''}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>— scheduled</span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Time (optional)</label>
                  <input type="time" value={interviewTime} onChange={e => setInterviewTime(e.target.value)} style={inputStyle} />
                </div>
                <button onClick={() => saveInterviewTime(applicant)} disabled={savingInterview || !interviewDate} style={btn(C.yellow, savingInterview || !interviewDate)}>
                  {savingInterview ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <p style={{ ...sectionLabel, marginBottom: '0.65rem' }}>Decision</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Once the interview is complete, accept to move to onboarding or reject the application.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => moveToStage(applicant, 'onboarding')} disabled={movingStage} style={outlineBtn(C.blue)}>
                Accept — Move to Onboarding
              </button>
              <button onClick={() => moveToStage(applicant, 'rejected')} disabled={movingStage} style={outlineBtn(C.red)}>
                Reject Application
              </button>
            </div>
          </div>
        )}

        {/* ── Onboarding card ── */}
        {isOnboarding && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.blue + '55', background: C.blue + '06' }}>

            {/* Step header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ ...sectionLabel, color: C.blue, marginBottom: 0 }}>
                Onboarding — Step {onboardStep} of {TOTAL_STEPS}
              </p>
              <StepDots current={onboardStep} total={TOTAL_STEPS} color={C.blue} />
            </div>

            {/* Step nav tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {[
                { n: 1, label: 'Affiliation', valid: s1Valid },
                { n: 2, label: 'Birthday',    valid: step2Valid },
                { n: 3, label: 'Position',    valid: step3Valid },
                { n: 4, label: 'Checklist',   valid: checklistCount > 0 },
              ].map(({ n, label, valid }) => (
                <button
                  key={n}
                  onClick={() => setOnboardStep(n)}
                  style={{
                    padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '0.78rem',
                    fontWeight: onboardStep === n ? 700 : 500, cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                    border: `1px solid ${onboardStep === n ? C.blue : (valid ? C.blue + '44' : 'var(--border)')}`,
                    background: onboardStep === n ? C.blue + '18' : 'var(--bg)',
                    color: onboardStep === n ? C.blue : (valid ? C.blue : 'var(--muted)'),
                  }}
                >
                  {valid && onboardStep !== n ? `${label} ✓` : label}
                </button>
              ))}
            </div>

            {/* ── Step 1: Affiliation ── */}
            {onboardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>What is their affiliation?</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                  {AFFILIATION_OPTIONS.map(opt => {
                    const active = onboardForm.affiliation === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setOnboardForm(f => ({ ...EMPTY_FORM, affiliation: opt.value }))}
                        style={{
                          padding: '0.75rem 1rem', borderRadius: '10px',
                          border: `1px solid ${active ? C.blue : 'var(--border)'}`,
                          background: active ? C.blue + '18' : 'var(--bg)',
                          color: active ? C.blue : 'var(--text)',
                          fontWeight: active ? 700 : 400, cursor: 'pointer',
                          fontFamily: 'DM Sans, sans-serif', fontSize: '0.88rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {onboardForm.affiliation && <AffiliationExtras />}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOnboardStep(2)} disabled={!s1Valid} style={btn(C.blue, !s1Valid)}>
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Birthday ── */}
            {onboardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Date of Birth</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>Required for volunteer records.</p>
                <div style={{ maxWidth: 260 }}>
                  <label style={labelStyle}>Birthday</label>
                  <input type="date" value={onboardForm.birthday} onChange={e => setOnboardForm(f => ({ ...f, birthday: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOnboardStep(1)} style={ghostBtn()}>Back</button>
                  <button onClick={() => setOnboardStep(3)} disabled={!onboardForm.birthday} style={btn(C.blue, !onboardForm.birthday)}>Next</button>
                </div>
              </div>
            )}

            {/* ── Step 3: Default Position ── */}
            {onboardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Default Position</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  The role this volunteer will most commonly fill. They can change this later.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem' }}>
                  {ROLES.map(role => {
                    const active = onboardForm.default_role === role
                    return (
                      <button
                        key={role}
                        onClick={() => setOnboardForm(f => ({ ...f, default_role: role }))}
                        style={{
                          padding: '0.65rem 0.9rem', borderRadius: '10px', textAlign: 'left',
                          border: `1px solid ${active ? C.blue : 'var(--border)'}`,
                          background: active ? C.blue + '18' : 'var(--bg)',
                          color: active ? C.blue : 'var(--text)',
                          fontWeight: active ? 700 : 400, cursor: 'pointer',
                          fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        {role}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOnboardStep(2)} style={ghostBtn()}>Back</button>
                  <button onClick={() => setOnboardStep(4)} disabled={!onboardForm.default_role} style={btn(C.blue, !onboardForm.default_role)}>Next</button>
                </div>
              </div>
            )}

            {/* ── Step 4: Checklist ── */}
            {onboardStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Onboarding Checklist</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                      {checklistCount} / {CHECKLIST_ITEMS.length}
                    </span>
                    {mandatoryComplete && (
                      <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '100px', background: C.green + '18', color: C.green, border: `1px solid ${C.green}44`, fontWeight: 600 }}>
                        Required Complete
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  Check items off as completed. Changes save automatically. Attach files where available.
                </p>

                {/* Legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ color: C.red, fontWeight: 700 }}>*</span> Required
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ color: 'var(--muted)' }}>○</span> Optional
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {CHECKLIST_ITEMS.map(item => {
                    const checked = checklist[item.key]
                    return (
                      <div
                        key={item.key}
                        style={{
                          padding: '0.85rem 1rem', borderRadius: '10px',
                          border: `1px solid ${checked ? C.blue + '55' : item.mandatory ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                          background: checked ? C.blue + '08' : item.mandatory ? 'rgba(239,68,68,0.02)' : 'var(--bg)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {/* Row: checkbox + label */}
                        <div
                          onClick={() => !savingChecklist && toggleChecklistItem(applicant.id, item.key, !checked)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', cursor: 'pointer' }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: '5px', flexShrink: 0,
                            border: `2px solid ${checked ? C.blue : item.mandatory ? C.red + '66' : 'var(--border)'}`,
                            background: checked ? C.blue : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}>
                            {checked && (
                              <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                                <path d="M1 4L4 7L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{
                              fontSize: '0.9rem', fontWeight: checked ? 600 : 400,
                              color: checked ? 'var(--text)' : 'var(--muted)',
                              transition: 'color 0.15s',
                            }}>
                              {item.label}
                            </span>
                            {item.mandatory && (
                              <span style={{ color: C.red, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1 }}>*</span>
                            )}
                          </div>
                          {checked && (
                            <span style={{ fontSize: '0.72rem', color: C.blue, fontWeight: 600, flexShrink: 0 }}>
                              Complete
                            </span>
                          )}
                        </div>

                        {/* File attachment row */}
                        {item.bucket && (
                          <FileRow item={item} applicantId={applicant.id} />
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => setOnboardStep(3)} style={ghostBtn()}>Back</button>
                  <button
                    onClick={handleCreateProfile}
                    disabled={creatingProfile || !allStepsValid}
                    style={btn(C.blue, creatingProfile || !allStepsValid)}
                  >
                    {creatingProfile ? 'Creating...' : 'Create Volunteer Profile'}
                  </button>
                </div>

                {/* Profile summary */}
                {allStepsValid && !creatingProfile && (
                  <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: C.blue + '06', border: `1px solid ${C.blue}25` }}>
                    <p style={{ ...sectionLabel, marginBottom: '0.6rem' }}>Profile Summary</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {profileSummaryItems().map(item => (
                        <div key={item.label} style={{
                          padding: '0.3rem 0.75rem', borderRadius: '100px',
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          fontSize: '0.78rem', color: 'var(--muted)',
                        }}>
                          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.label}: </span>{item.value}
                        </div>
                      ))}
                      <div style={{
                        padding: '0.3rem 0.75rem', borderRadius: '100px',
                        background: C.blue + '10', border: `1px solid ${C.blue}35`, fontSize: '0.78rem',
                      }}>
                        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Password: </span>
                        <span style={{ fontFamily: 'DM Mono, monospace', color: C.blue, fontWeight: 600 }}>BFC2025!</span>
                      </div>
                    </div>
                  </div>
                )}

                {!allStepsValid && (
                  <p style={{ fontSize: '0.82rem', color: C.yellow, fontWeight: 500 }}>
                    {!s1Valid    && 'Affiliation details required. '}
                    {!step2Valid && 'Birthday required. '}
                    {!step3Valid && 'Default position required. '}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Rejected ── */}
        {isRejected && (
          <div style={{ ...card, padding: '1rem 1.25rem', borderColor: C.red + '44', background: C.red + '06' }}>
            <p style={{ fontSize: '0.85rem', color: C.red, fontWeight: 500 }}>This applicant has been rejected.</p>
          </div>
        )}
      </div>
    )
  }

  // ── Detail wrapper ──
  if (selected) {
    return (
      <div style={{ position: 'relative' }}>
        <ApplicantDetail applicant={selected} />
        {toast && <Toast toast={toast} />}
      </div>
    )
  }

  // ── List view ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {STAGES.map(stage => {
          const color  = STAGE_COLORS[stage]
          const active = activeStageFilter === stage
          return (
            <button
              key={stage}
              onClick={() => setActiveStageFilter(stage)}
              style={{
                padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem',
                fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                background: active ? color + '18' : 'var(--surface)',
                color:      active ? color         : 'var(--muted)',
                border:     active ? `1px solid ${color}55` : '1px solid var(--border)',
              }}
            >
              {STAGE_LABELS[stage]} <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', opacity: 0.8 }}>({stageCounts[stage]})</span>
            </button>
          )
        })}
      </div>

      {loadError && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: C.red + '08', border: `1px solid ${C.red}33` }}>
          <p style={{ fontSize: '0.85rem', color: C.red, fontWeight: 500 }}>Failed to load: {loadError}</p>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading applicants...</p>
        ) : filteredApplicants.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No applicants in this stage.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {filteredApplicants.map(a => (
              <div
                key={a.id}
                onClick={() => selectApplicant(a)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--surface)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontWeight: 600, color: C.blue,
                    fontSize: '0.95rem', flexShrink: 0,
                  }}>
                    {a.full_name?.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{a.full_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{a.email}</p>
                      {a.interview_scheduled_at && (
                        <span style={{ fontSize: '0.72rem', color: C.yellow, fontWeight: 600 }}>
                          {new Date(a.interview_scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <StagePill stage={a.stage} />
                  {a.created_at && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </span>
                  )}
                  <span style={{ color: 'var(--muted)' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <Toast toast={toast} />}
    </div>
  )
}

function Toast({ toast }) {
  const bg = toast.type === 'error' ? '#ef4444' : '#3b82f6'
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      background: bg, color: '#fff', padding: '0.75rem 1.5rem',
      borderRadius: '100px', fontWeight: 500, fontSize: '0.9rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {toast.text}
    </div>
  )
}