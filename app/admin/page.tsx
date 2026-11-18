import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,full_name,avatar_url,role')
    .eq('id', user.id)
    .maybeSingle()

  if ((profile as Profile | null)?.role !== 'admin') redirect('/')
  return <AdminDashboard profile={profile as Profile} />
}
