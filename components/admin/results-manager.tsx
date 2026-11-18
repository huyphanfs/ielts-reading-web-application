'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { QuestionResult, SavedTestResult, StudyNote } from '@/lib/types'

const supabase = createClient()
type ResultWithProfile = SavedTestResult & { profiles: { full_name: string | null; email: string } | null }

function duration(seconds: number | null) {
  if (seconds === null) return '—'
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function ResultsManager() {
  const [results, setResults] = useState<ResultWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'all' | 'test' | 'practice'>('all')
  const [selected, setSelected] = useState<ResultWithProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadResults = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('test_results')
      .select('*, profiles(id,email,full_name)')
      .order('created_at', { ascending: false })
    if (queryError) {
      setError('Không thể tải kết quả. Hãy kiểm tra quyền đọc kết quả và kết nối Supabase.')
      setResults([])
    } else {
      setResults((data ?? []) as unknown as ResultWithProfile[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadResults() }, [loadResults])

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('vi')
    return results.filter((result) => {
      if (mode !== 'all' && result.mode !== mode) return false
      const profile = Array.isArray(result.profiles) ? result.profiles[0] : result.profiles
      const searchable = `${profile?.full_name ?? ''} ${profile?.email ?? ''} ${result.test_title}`.toLocaleLowerCase('vi')
      return !term || searchable.includes(term)
    })
  }, [mode, query, results])

  const questionResults = useMemo(() => {
    if (!selected || !Array.isArray(selected.question_results)) return []
    return selected.question_results.filter((item): item is QuestionResult => Boolean(item && typeof item === 'object' && 'question_id' in item))
  }, [selected])

  const studyNotes = useMemo<StudyNote[]>(() => {
    if (!selected || !Array.isArray(selected.question_results)) return []
    const record = selected.question_results.find((item) => item && typeof item === 'object' && 'record_type' in item && item.record_type === 'study_notes') as unknown as { notes?: StudyNote[] } | undefined
    return record?.notes ?? []
  }, [selected])

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-lg font-bold text-slate-950">Kết quả học viên</h2><p className="mt-1 text-sm text-slate-500">Theo dõi điểm số, thời gian và từng câu trả lời đã nộp.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative"><span className="sr-only">Tìm theo tên, email hoặc tên đề</span><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm học viên hoặc đề thi" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-400 sm:w-64" /></label>
        <label className="sr-only" htmlFor="result-mode">Lọc theo chế độ</label><select id="result-mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"><option value="all">Tất cả chế độ</option><option value="test">Full Test</option><option value="practice">Luyện tập</option></select>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {loading ? <div className="space-y-3 p-5">{[1,2,3].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Học viên</th><th className="px-4 py-3 font-semibold">Đề thi</th><th className="px-4 py-3 font-semibold">Chế độ</th><th className="px-4 py-3 text-center font-semibold">Điểm thô</th><th className="px-4 py-3 text-center font-semibold">Band</th><th className="px-4 py-3 text-center font-semibold">Thời gian</th><th className="px-4 py-3 font-semibold">Ngày nộp</th><th className="px-5 py-3 text-right font-semibold">Bài làm</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{filtered.map((result) => {
          const profile = Array.isArray(result.profiles) ? result.profiles[0] : result.profiles
          return <tr key={result.id} className="hover:bg-slate-50/70">
            <td className="px-5 py-4"><p className="font-semibold text-slate-900">{profile?.full_name || 'Chưa có tên'}</p><p className="mt-0.5 text-xs text-slate-500">{profile?.email ?? '—'}</p></td>
            <td className="max-w-56 truncate px-4 py-4 font-medium text-slate-700">{result.test_title}</td>
            <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result.mode === 'test' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'}`}>{result.mode === 'test' ? 'Test' : 'Practice'}</span></td>
            <td className="px-4 py-4 text-center font-semibold text-slate-800">{result.score}/{result.total_questions}</td>
            <td className="px-4 py-4 text-center"><span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">{Number(result.band_score).toFixed(1)}</span></td>
            <td className="px-4 py-4 text-center tabular-nums text-slate-600">{duration(result.time_spent)}</td>
            <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{new Date(result.created_at).toLocaleString('vi-VN')}</td>
            <td className="px-5 py-4 text-right"><Button variant="outline" size="sm" onClick={() => setSelected(result)} className="h-8 rounded-lg border-slate-200">Xem bài làm</Button></td>
          </tr>
        })}</tbody>
      </table></div> : <div className="px-6 py-14 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Search className="size-5" /></div><p className="mt-4 text-sm font-semibold text-slate-800">{query ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có kết quả học viên'}</p><p className="mt-1 text-xs text-slate-500">{query ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Kết quả sẽ xuất hiện tại đây sau khi học viên nộp bài.'}</p></div>}
    </div>
    <p className="text-right text-xs text-slate-500">{filtered.length} / {results.length} kết quả</p>

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="submission-title" className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Bài làm chi tiết</p><h2 id="submission-title" className="mt-1 text-lg font-bold text-slate-950">{selected.test_title}</h2><p className="mt-1 text-xs text-slate-500">{(Array.isArray(selected.profiles) ? selected.profiles[0] : selected.profiles)?.full_name ?? 'Học viên'} · {(Array.isArray(selected.profiles) ? selected.profiles[0] : selected.profiles)?.email ?? ''}</p></div><Button variant="ghost" size="icon" aria-label="Đóng bài làm" onClick={() => setSelected(null)}><X className="size-4" /></Button></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Summary label="Điểm" value={`${selected.score}/${selected.total_questions}`} /><Summary label="Band" value={Number(selected.band_score).toFixed(1)} /><Summary label="Thời gian" value={duration(selected.time_spent)} /><Summary label="Ngày nộp" value={new Date(selected.created_at).toLocaleDateString('vi-VN')} /></div>
          <div className="overflow-hidden rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Câu</th><th className="px-4 py-3">Dạng câu hỏi</th><th className="px-4 py-3">Học viên trả lời</th><th className="px-4 py-3">Đáp án</th><th className="px-4 py-3">Kết quả</th></tr></thead><tbody className="divide-y divide-slate-100">{questionResults.map((question) => <tr key={question.question_id}><td className="px-4 py-3 font-bold text-slate-800">{question.question_number}</td><td className="px-4 py-3 text-slate-700">{question.question_category}</td><td className="px-4 py-3 text-slate-600">{Array.isArray(question.user_answer) ? question.user_answer.join(' / ') : question.user_answer || '—'}</td><td className="px-4 py-3 font-medium text-slate-800">{question.accepted_answers?.join(' / ') || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${question.status === 'correct' ? 'bg-emerald-50 text-emerald-700' : question.status === 'incorrect' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{question.status === 'correct' ? 'Đúng' : question.status === 'incorrect' ? 'Sai' : 'Bỏ qua'}</span></td></tr>)}</tbody></table></div>
          {studyNotes.length > 0 && <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"><h3 className="text-sm font-bold text-indigo-900">Ghi chú của học viên</h3><div className="mt-3 space-y-3">{studyNotes.map((note) => <div key={note.id} className="rounded-lg bg-white p-3">{note.quote && <blockquote className="border-l-2 border-indigo-300 pl-3 text-sm italic text-slate-600">{note.quote}</blockquote>}{note.text && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{note.text}</p>}</div>)}</div></div>}
        </div>
      </section>
    </div>}
  </div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>
}
