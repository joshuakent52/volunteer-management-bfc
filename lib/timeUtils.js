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
export function asUTC(ts) {
  if (!ts) return null
  return /Z|[+-]\d{2}:\d{2}$/.test(ts) ? new Date(ts) : new Date(ts + 'Z')
}

export function formatMountain(ts) { if (!ts) return '—'; return asUTC(ts).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' }) }
export function formatDateMountain(ts) { if (!ts) return '—'; return asUTC(ts).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' }) }
export function toMountainInputValue(ts) {
  if (!ts) return ''
  const d = asUTC(ts)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const get = type => parts.find(p => p.type === type).value
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}
export function fromMountainInputValue(val) {
  if (!val) return null
  const [datePart, timePart] = val.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  let utcMs = Date.UTC(year, month - 1, day, hour + 7, minute)
  for (let i = 0; i < 4; i++) {
    const displayed = toMountainInputValue(new Date(utcMs).toISOString())
    if (displayed === val) break
    const [dDate, dTime] = displayed.split('T')
    const [dy, dm, dd] = dDate.split('-').map(Number)
    const [dh, dmin] = dTime.split(':').map(Number)
    utcMs += (Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(dy, dm - 1, dd, dh, dmin))
  }
  return new Date(utcMs).toISOString()
}


export function formatTime(ts) { if (!ts) return '—'; return asUTC(ts).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' }) }
export function formatDate(ts) { if (!ts) return '—'; return asUTC(ts).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' }) }
export function formatDateTime(ts) { if (!ts) return '—'; return asUTC(ts).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } 