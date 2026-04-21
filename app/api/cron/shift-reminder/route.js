import 'server-only'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

function getMountainNow() {
  // Returns a Date whose local time fields reflect Mountain Time
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })
  return new Date(str)
}

export async function GET(req) {
  // ── 1. Verify this is a legitimate Vercel cron call ───────────────────────
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Figure out where we are in Mountain Time ───────────────────────────
  const now = getMountainNow()
  const dayName   = DAYS[now.getDay()]                           // e.g. "tuesday"
  const todayStr  = new Date().toLocaleDateString('en-CA', {    // "2025-06-03"
    timeZone: 'America/Denver'
  })
  const h = now.getHours() + now.getMinutes() / 60
  const currentShift = h >= 10 && h < 14 ? '10-2'
                     : h >= 14 && h < 18 ? '2-6'
                     : null

  // Cron fires at the right time but just in case it's outside shift hours
  if (!currentShift || now.getDay() === 0 || now.getDay() === 6) {
    return Response.json({ skipped: true, reason: 'Outside shift hours or weekend' })
  }

  // ── 3. Load scheduled volunteers for this slot ────────────────────────────
  // Exclude anyone whose schedule entry has a note (e.g. "arriving late")
  const { data: scheduleEntries, error: schedErr } = await supabaseAdmin
    .from('schedule')
    .select('volunteer_id, week_pattern, start_date, end_date, notes')
    .eq('day_of_week', dayName)
    .eq('shift_time', currentShift)
    .is('notes', null)                    // ← exclude entries with schedule notes

  if (schedErr) {
    console.error('schedule query failed:', schedErr)
    return Response.json({ error: schedErr.message }, { status: 500 })
  }

  // Filter by date range and week-pattern
  const weekNumber = getWeekOfMonth(now)  // 1-based: 1st, 2nd, 3rd, 4th occurrence this month
  const scheduled = (scheduleEntries || []).filter(s => {
    if (s.start_date && s.start_date > todayStr) return false
    if (s.end_date   && s.end_date   < todayStr) return false
    if (s.week_pattern === 'odd'  && weekNumber % 2 !== 1) return false
    if (s.week_pattern === 'even' && weekNumber % 2 !== 0) return false
    return true
  })

  if (scheduled.length === 0) {
    return Response.json({ pushed: 0, reason: 'Nobody scheduled' })
  }

  const scheduledIds = scheduled.map(s => s.volunteer_id)

  // ── 4. Remove anyone already clocked in ───────────────────────────────────
  const { data: activeShifts } = await supabaseAdmin
    .from('shifts')
    .select('volunteer_id')
    .is('clock_out', null)
    .in('volunteer_id', scheduledIds)

  const clockedInIds = new Set((activeShifts || []).map(s => s.volunteer_id))

  // ── 5. Remove anyone who has an approved callout today ────────────────────
  const { data: callouts } = await supabaseAdmin
    .from('callouts')
    .select('volunteer_id')
    .eq('callout_date', todayStr)
    .eq('shift_time', currentShift)
    .eq('status', 'approved')
    .in('volunteer_id', scheduledIds)

  const calledOutIds = new Set((callouts || []).map(c => c.volunteer_id))

  // ── 6. Build the final target list ───────────────────────────────────────
  const targetIds = scheduledIds.filter(id =>
    !clockedInIds.has(id) && !calledOutIds.has(id)
  )

  if (targetIds.length === 0) {
    return Response.json({ pushed: 0, reason: 'All scheduled volunteers accounted for' })
  }
  
  console.log('Looking for subscriptions for these IDs:', targetIds)
  console.log('Today:', todayStr, '| Day:', dayName, '| Shift:', currentShift)

  // ── 7. Fetch push subscriptions and send ─────────────────────────────────
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .in('user_id', targetIds)

  if (!subs || subs.length === 0) {
    return Response.json({ pushed: 0, reason: 'No push subscriptions found' })
  }

  const payload = JSON.stringify({
    title: 'Shift starting soon',
    body:  'Please clock in or submit a call-out.',
    url:   '/volunteer',
  })

  const staleEndpoints = []

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      } catch (err) {
        if (err.statusCode === 410) staleEndpoints.push(sub.endpoint)
      }
    })
  )

  if (staleEndpoints.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints)
  }

  return Response.json({
    pushed:  subs.length - staleEndpoints.length,
    targets: targetIds.length,
    shift:   currentShift,
    day:     dayName,
  })
}

// Returns which occurrence of this weekday it is in the current month (1=first, 2=second, etc.)
function getWeekOfMonth(date) {
  const d = new Date(date)
  const target = d.getDay()
  const check  = new Date(d.getFullYear(), d.getMonth(), 1)
  let count = 0
  while (check <= d) {
    if (check.getDay() === target) count++
    check.setDate(check.getDate() + 1)
  }
  return count
}