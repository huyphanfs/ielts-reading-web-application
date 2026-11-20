'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'

export function AppHeader({ compact = false, onHomeClick }: { compact?: boolean; onHomeClick?: () => void }) {
  const { user, profile, loading, authError, signInWithGoogle, signOut } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <div className={`mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-4 sm:px-6 ${compact ? 'max-w-none' : ''}`}>
        <Link
          href="/"
          onClick={(event) => {
            if (onHomeClick) {
              event.preventDefault()
              onHomeClick()
            } else if (pathname !== '/') {
              event.preventDefault()
              router.push('/')
            }
          }}
          className="group flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label="IELTS Reading — Home"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-200 transition-transform group-hover:-rotate-3">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[15px] font-bold tracking-tight text-slate-900">IELTS Reading</span>
            <span className="hidden text-[11px] font-medium tracking-[0.14em] text-slate-500 sm:block">COMPUTER-DELIVERED</span>
          </span>
        </Link>

        <nav aria-label="Account navigation" className="flex shrink-0 items-center gap-2">
          {!loading && user && profile?.role === 'admin' && (
            <Link href="/admin" className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:px-2.5"><ShieldCheck className="size-4 sm:mr-1.5" /><span className="hidden sm:inline">Admin</span></Link>
          )}
          {loading ? (
            <span className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" aria-label="Loading account" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-40 truncate text-sm font-medium text-slate-600 md:block" title={profile?.full_name ?? user.email ?? ''}>
                {profile?.full_name ?? user.email}
              </span>
              <Button variant="ghost" size="icon" className="rounded-lg text-slate-500 hover:text-slate-900" onClick={() => void signOut()} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <Button onClick={() => void signInWithGoogle()} size="sm" className="h-9 rounded-lg bg-sky-600 px-3 text-white shadow-sm hover:bg-sky-700">
              <Sparkles className="mr-1.5 size-4" />
              <span className="hidden sm:inline">Sign in with Google</span>
              <span className="sm:hidden">Sign in</span>
            </Button>
          )}
          {user && profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="size-8 rounded-full border border-slate-200 object-cover" referrerPolicy="no-referrer" />
          ) : user ? (
            <span className="flex size-8 items-center justify-center rounded-full bg-sky-50 text-sky-700" aria-hidden="true"><UserRound className="size-4" /></span>
          ) : null}
        </nav>
      </div>
      {authError && <div role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-center text-sm text-rose-700">{authError}</div>}
    </header>
  )
}
