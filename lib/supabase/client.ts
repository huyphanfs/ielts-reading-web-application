import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseConfig } from '@/lib/supabase/config'

export function createClient() {
  const { url, key } = getSupabaseConfig()

  return createBrowserClient(url, key, {
    cookieOptions: { secure: process.env.NODE_ENV === 'production' },
  })
}
