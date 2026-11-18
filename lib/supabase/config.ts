const TARGET_SUPABASE_URL = 'https://ftjvqnmbfjrrikqnekdg.supabase.co'
const TARGET_SUPABASE_HOST = 'ftjvqnmbfjrrikqnekdg.supabase.co'
const TARGET_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6Ocn9tTxlh2dju44AvN_ng_4jpE2DTE'

export function getSupabaseConfig() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  let configuredProjectMatches = false

  if (configuredUrl) {
    try {
      configuredProjectMatches = new URL(configuredUrl).hostname === TARGET_SUPABASE_HOST
    } catch {
      configuredProjectMatches = false
    }
  }

  const configuredKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return {
    url: TARGET_SUPABASE_URL,
    key: configuredProjectMatches && configuredKey ? configuredKey : TARGET_SUPABASE_PUBLISHABLE_KEY,
  }
}
