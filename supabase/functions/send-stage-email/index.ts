
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { applicantEmail, applicantName, stage } = await req.json()

    if (!applicantEmail || !applicantName || !stage) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: applicantEmail, applicantName, stage' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const validStages = ['interview', 'onboarding', 'rejected']
    if (!validStages.includes(stage)) {
      return new Response(
        JSON.stringify({ error: `Invalid stage. Must be one of: ${validStages.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 1. Fetch the email template from Supabase ─────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('subject, body')
      .eq('stage', stage)
      .single()

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ error: `No email template found for stage: ${stage}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 2. Replace placeholders in subject and body ───────────────────────
    const subject = template.subject
      .replace(/\{\{name\}\}/g, applicantName)
      .replace(/\{\{email\}\}/g, applicantEmail)

    const body = template.body
      .replace(/\{\{name\}\}/g, applicantName)
      .replace(/\{\{email\}\}/g, applicantEmail)

    // ── 3. Exchange refresh token for a fresh Gmail access token ──────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     Deno.env.get('GMAIL_CLIENT_ID')!,
        client_secret: Deno.env.get('GMAIL_CLIENT_SECRET')!,
        refresh_token: Deno.env.get('GMAIL_REFRESH_TOKEN')!,
        grant_type:    'refresh_token',
      }),
    })

    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      console.error('Gmail token error:', tokenData)
      return new Response(
        JSON.stringify({ error: 'Failed to obtain Gmail access token. Check your OAuth secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accessToken = tokenData.access_token
    const senderEmail = Deno.env.get('GMAIL_SENDER_EMAIL')!

    // ── 4. Build the RFC 2822 email message and base64url-encode it ───────
    const emailLines = [
      `From: BFC Volunteer Team <${senderEmail}>`,
      `To: ${applicantName} <${applicantEmail}>`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      body,
    ]

    const rawEmail = emailLines.join('\r\n')

    // base64url encode (Gmail requires base64url, not standard base64)
    const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // ── 5. Send via Gmail API ─────────────────────────────────────────────
    const gmailRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      }
    )

    const gmailData = await gmailRes.json()

    if (!gmailRes.ok) {
      console.error('Gmail send error:', gmailData)
      return new Response(
        JSON.stringify({ error: `Gmail API error: ${gmailData.error?.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, messageId: gmailData.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Unexpected server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
