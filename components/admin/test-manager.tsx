'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CirclePlus, Dices, LoaderCircle, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { AIParseTestModal } from '@/components/admin/ai-parse-test-modal'
import type { Passage } from '@/lib/types'

const supabase = createClient()

type TestRow = { id: string; title: string; passage_1_id: string | null; passage_2_id: string | null; passage_3_id: string | null; created_at: string }

export function TestManager() {
  const [passages, setPassages] = useState<Passage[]>([])
  const [tests, setTests] = useState<TestRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [title, setTitle] = useState('')
  const [passageIds, setPassageIds] = useState(['', '', ''])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [passageResult, testResult, questionResult] = await Promise.all([
      supabase.from('passages').select('*').order('passage_part').order('title'),
      supabase.from('tests').select('*').order('created_at', { ascending: false }),
      supabase.from('questions').select('id,passage_id'),
    ])
    const loadError = passageResult.error ?? testResult.error ?? questionResult.error
    if (loadError) {
      setError('Không thể tải đề thi hoặc thư viện bài đọc.')
      setLoading(false)
      return
    }
    const nextCounts: Record<string, number> = {}
    for (const question of questionResult.data ?? []) nextCounts[question.passage_id] = (nextCounts[question.passage_id] ?? 0) + 1
    setPassages((passageResult.data ?? []) as Passage[])
    setTests((testResult.data ?? []) as TestRow[])
    setCounts(nextCounts)
    setLoading(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const passageMap = useMemo(() => new Map(passages.map((passage) => [passage.id, passage])), [passages])
  // Chỉ lấy bài đọc phân loại "Test" (is_test_only === true); bỏ qua bài "Practice"
  const testOnlyPassages = useMemo(() => passages.filter((passage) => passage.is_test_only === true), [passages])
  const optionsForPart = (part: number) => testOnlyPassages.filter((passage) => passage.passage_part === part)
  const total = passageIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0)
  const complete = passageIds.every(Boolean)
  const validTotal = complete && total === 40

  const setPassage = (index: number, value: string) => setPassageIds((current) => current.map((id, i) => i === index ? value : id))

  const assignRandom = () => {
    setError(null)
    const part1 = testOnlyPassages.filter((passage) => passage.passage_part === 1 && counts[passage.id] === 13)
    const part2 = testOnlyPassages.filter((passage) => passage.passage_part === 2 && (counts[passage.id] === 13 || counts[passage.id] === 14))
    const part3 = testOnlyPassages.filter((passage) => passage.passage_part === 3 && (counts[passage.id] === 13 || counts[passage.id] === 14))
    const combinations: Array<[Passage, Passage, Passage]> = []
    for (const first of part1) for (const second of part2) for (const third of part3) {
      if (second.id !== third.id && counts[second.id] + counts[third.id] === 27) combinations.push([first, second, third])
    }
    if (!combinations.length) {
      setError('Chưa có bộ bài đọc phân loại "Test" đủ 40 câu. Cần Passage 1 (Test) có 13 câu và Passage 2–3 (Test) có tổng 27 câu.')
      return
    }
    const chosen = combinations[Math.floor(Math.random() * combinations.length)]
    setPassageIds(chosen.map((passage) => passage.id))
    if (!title.trim()) setTitle(`Test ${tests.length + 1}`)
    setNotice('Đã gán ngẫu nhiên một bộ đề (phân loại Test) đủ 40 câu. Hãy lưu để tạo đề thi.')
  }

  const saveTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!complete || new Set(passageIds).size !== 3) {
      setError('Chọn đủ ba bài đọc khác nhau cho Passage 1, 2 và 3.')
      return
    }
    if (!validTotal) {
      setError(`Tổng hiện tại là ${total} câu. Đề thi phải có đúng 40 câu.`)
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase.from('tests').insert({
      title: title.trim() || `Test ${tests.length + 1}`,
      passage_1_id: passageIds[0],
      passage_2_id: passageIds[1],
      passage_3_id: passageIds[2],
    })
    if (insertError) setError('Không thể tạo đề thi. Kiểm tra quyền quản trị và dữ liệu bài đọc.')
    else {
      setNotice('Đã tạo đề thi và gán đủ 40 câu.')
      setTitle('')
      setPassageIds(['', '', ''])
      await loadData()
    }
    setSaving(false)
  }

  const deleteTest = async (test: TestRow) => {
    if (!window.confirm(`Xóa đề "${test.title}"? Kết quả cũ vẫn được giữ nguyên.`)) return
    const { error: deleteError } = await supabase.from('tests').delete().eq('id', test.id)
    if (deleteError) setError('Không thể xóa đề thi đang có dữ liệu liên quan.')
    else {
      setNotice('Đã xóa đề thi.')
      await loadData()
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white"><Sparkles className="size-5" /></span><div><h2 className="font-bold text-slate-900">AI Tự Động Tạo Đề</h2><p className="mt-1 text-sm text-slate-500">Dán văn bản thô — AI tự động trích xuất passage, câu hỏi, đáp án và giải thích.</p></div></div>
      <Button onClick={() => setAiModalOpen(true)} className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 px-4 text-white hover:from-sky-700 hover:to-indigo-700"><Sparkles className="mr-2 size-4" />AI Tự Động Tạo Đề</Button>
    </div>

    <AIParseTestModal open={aiModalOpen} onClose={() => setAiModalOpen(false)} onSaved={() => { void loadData(); setNotice('AI đã tạo bài đọc và câu hỏi. Kiểm tra thư viện passage để ghép đề.') }} />

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><CirclePlus className="size-5" /></span>
        <div>
          <h2 className="font-bold text-slate-900">Tạo đề thi thủ công</h2>
          <p className="mt-1 text-sm text-slate-500">
            Chỉ hiển thị các bài đọc được gán phân loại <strong>Test</strong> ({testOnlyPassages.length} bài). Các bài <strong>Practice</strong> sẽ không dùng cho đề thi.
          </p>
        </div>
      </div>
      <form onSubmit={(event) => void saveTest(event)} className="space-y-4">
        <label className="block text-xs font-semibold text-slate-600">Tên đề thi<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Test ${tests.length + 1}`} className="mt-1.5 h-10 w-full max-w-[520px] rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" /></label>
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((part, index) => (
            <label key={part} className="text-xs font-semibold text-slate-600">
              Passage {part} (Test)
              <select required value={passageIds[index]} onChange={(event) => setPassage(index, event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400">
                <option value="">Chọn bài đọc Test</option>
                {optionsForPart(part).map((passage) => (
                  <option key={passage.id} value={passage.id}>
                    {passage.title}{passage.topic ? ` [${passage.topic}]` : ''} · {counts[passage.id] ?? 0} câu
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${complete && validTotal ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center gap-2 text-sm">{complete && validTotal ? <Check className="size-4 text-emerald-700" /> : <span className="size-2 rounded-full bg-amber-400" />}<span className="font-semibold text-slate-800">{complete ? `${total}/40 câu` : 'Chọn đủ ba bài đọc'}</span><span className="text-xs text-slate-500">{complete && validTotal ? 'Đã đủ cấu hình' : 'Cần đúng 40 câu'}</span></div>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={assignRandom} className="h-9 rounded-lg"><Dices className="mr-2 size-4" />Gán Ngẫu Nhiên (Đủ 40 câu)</Button><Button type="submit" disabled={saving || !validTotal} className="h-9 rounded-lg bg-sky-600 text-white hover:bg-sky-700"><CirclePlus className="mr-2 size-4" />{saving ? 'Đang lưu' : 'Tạo đề'}</Button></div>
        </div>
      </form>
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">Đề thi đã tạo</h2><p className="mt-1 text-xs text-slate-500">{tests.length} đề trong thư viện</p></div><span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Dices className="size-4" /></span></div>
      {loading ? <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Đang tải…</div> : tests.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Tên đề</th><th className="px-4 py-3 font-semibold">Passage 1</th><th className="px-4 py-3 font-semibold">Passage 2</th><th className="px-4 py-3 font-semibold">Passage 3</th><th className="px-4 py-3 text-center font-semibold">Tổng câu</th><th className="px-5 py-3 text-right font-semibold">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{tests.map((test) => {
        const ids = [test.passage_1_id, test.passage_2_id, test.passage_3_id]
        const count = ids.reduce((sum, id) => sum + (id ? counts[id] ?? 0 : 0), 0)
        return <tr key={test.id} className="hover:bg-slate-50/70"><th className="px-5 py-4 font-semibold text-slate-900">{test.title}</th>{ids.map((id, index) => <td key={index} className="max-w-48 truncate px-4 py-4 text-slate-600">{id ? passageMap.get(id)?.title ?? 'Bài đọc không còn tồn tại' : 'Chưa gán'}</td>)}<td className="px-4 py-4 text-center"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${count === 40 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{count}/40</span></td><td className="px-5 py-4 text-right"><Button variant="ghost" size="icon-sm" onClick={() => void deleteTest(test)} aria-label={`Xóa ${test.title}`} className="text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></Button></td></tr>
      })}</tbody></table></div> : <div className="p-10 text-center"><p className="text-sm font-semibold text-slate-800">Chưa có đề thi</p><p className="mt-1 text-xs text-slate-500">Tạo đề đầu tiên khi thư viện có các bài đọc đủ câu hỏi.</p></div>}
    </section>
  </div>
}
