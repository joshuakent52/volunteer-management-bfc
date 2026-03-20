export function getMountainNow() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })
  return new Date(str)
}

export function getMountainLabel() {
  const now = new Date()
  const mtnStr = now.toLocaleString('en-US', { timeZone: 'America/Denver' })
  const mtnDate = new Date(mtnStr)
  const mtnOffset = (now - mtnDate) / 60000
  return (mtnOffset <= 360) ? 'MDT' : 'MST'
}

export function getCurrentDayAndShift() {
  const now = getMountainNow()
  const dayIndex = now.getDay()
  if (dayIndex === 0 || dayIndex === 6) return { day: null, shift: null, isShiftTime: false }
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayIndex]
  const timeDecimal = now.getHours() + now.getMinutes() / 60
  let shift = null
  if (timeDecimal >= 10 && timeDecimal < 14) shift = '10-2'
  else if (timeDecimal >= 14 && timeDecimal < 18) shift = '2-6'
  return { day: dayName, shift, isShiftTime: !!shift }
}

// Ensure Supabase timestamps (which may lack 'Z') are always parsed as UTC
export function asUTC(ts) {
  if (!ts) return null
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}

export function formatMountain(ts) {
  if (!ts) return '—'
  return asUTC(ts).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })
}

export function formatDateMountain(ts) {
  if (!ts) return '—'
  return asUTC(ts).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })
}

export function formatDateTime(ts) {
  if (!ts) return '—'
  return asUTC(ts).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Convert a UTC ISO timestamp → "YYYY-MM-DDTHH:MM" in Mountain time for datetime-local inputs
export function toMountainInputValue(ts) {
  if (!ts) return ''
  const d = asUTC(ts)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = type => parts.find(p => p.type === type).value
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

// Convert a "YYYY-MM-DDTHH:MM" Mountain time string back to UTC ISO
export function fromMountainInputValue(val) {
  if (!val) return null
  const [datePart, timePart] = val.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day, hour + 7, minute))
  const check = toMountainInputValue(candidate.toISOString())
  if (check === val) return candidate.toISOString()
  const checkDate = new Date(check.replace('T', ' ') + ':00')
  const inputDate = new Date(val.replace('T', ' ') + ':00')
  const diffMs = inputDate - checkDate
  return new Date(candidate.getTime() - diffMs).toISOString()
}

export function totalHours(shifts) {
  return shifts?.reduce((acc, s) => {
    if (!s.clock_out) return acc
    return acc + (asUTC(s.clock_out) - asUTC(s.clock_in)) / 3600000
  }, 0).toFixed(1) || '0.0'
}

export function calcShiftHours(clock_in, clock_out) {
  if (!clock_out) return null
  return ((asUTC(clock_out) - asUTC(clock_in)) / 3600000).toFixed(1)
}

export function weekOfMonth(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  let count = 0
  const target = d.getDay()
  const check = new Date(d.getFullYear(), d.getMonth(), 1)
  while (check <= d) {
    if (check.getDay() === target) count++
    check.setDate(check.getDate() + 1)
  }
  return count
}
