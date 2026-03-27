import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,       // persist to localStorage (default true)
      autoRefreshToken: true,     // silently refresh before expiry (default true)
      detectSessionInUrl: true,   // handle magic link callbacks
      storageKey: 'bingham-app',  // optional but good for PWAs
    }
  }
)