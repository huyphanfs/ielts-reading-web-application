'use client'

import { useState } from 'react'
import { BarChart3, BookOpenText, ClipboardList, ShieldCheck } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { PassageManager } from '@/components/admin/passage-manager'
import { ResultsManager } from '@/components/admin/results-manager'
import { TestManager } from '@/components/admin/test-manager'
import type { Profile } from '@/lib/types'

const tabs = [
  { id: 'passages', label: 'Bài đọc & Câu hỏi', icon: BookOpenText },
  { id: 'tests', label: 'Đề thi', icon: ClipboardList },
  { id: 'results', label: 'Kết quả học viên', icon: BarChart3 },
] as const

type TabId = typeof tabs[number]['id']

export function AdminDashboard({ profile }: { profile: Profile }) {
  const [activeTab, setActiveTab] = useState<TabId>('passages')

  return <main className="min-h-screen bg-[#f7f8fc] text-slate-900">
    <AppHeader />
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"><ShieldCheck className="size-3.5" /> ADMINISTRATOR</div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Bảng điều khiển</h1><p className="mt-2 text-sm text-slate-600">Xin chào {profile.full_name || profile.email}. Quản lý nội dung, đề thi và kết quả học viên.</p></div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tài khoản quản trị</p><p className="mt-1 text-sm font-semibold text-slate-900">{profile.email}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[245px_minmax(0,1fr)]">
        <nav aria-label="Các mục quản trị" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" role="tablist" aria-orientation="vertical">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`admin-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`admin-panel-${id}`} onClick={() => setActiveTab(id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${activeTab === id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700'}`}><Icon className="size-4" />{label}</button>)}
        </nav>
        <section id={`admin-panel-${activeTab}`} role="tabpanel" aria-labelledby={`admin-tab-${activeTab}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white/50 p-4 sm:p-6">
          {activeTab === 'passages' && <PassageManager />}
          {activeTab === 'tests' && <TestManager />}
          {activeTab === 'results' && <ResultsManager />}
        </section>
      </div>
    </div>
  </main>
}
