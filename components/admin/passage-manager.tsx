'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronDown, CirclePlus, LoaderCircle, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionGroupManager } from '@/components/admin/question-group-manager'
import { RichTextEditor } from '@/components/admin/rich-text-editor'
import { AIParseTestModal } from '@/components/admin/ai-parse-test-modal'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'
import type { ExamGroup, Passage, Question, QuestionGroup } from '@/lib/types'

const supabase = createClient()

export function PassageManager() {
  const [passages, setPassages] = useState<Passage[]>([])
  const [groups, setGroups] = useState<QuestionGroup[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedPassageId, setSelectedPassageId] = useState('')
  const [title, setTitle] = useState('')
  const [part, setPart] = useState<1 | 2 | 3>(1)
  const [testOnly, setTestOnly] = useState(false)
  const [content, setContent] = useState('')
  const [timeLimit, setTimeLimit] = useState('20')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  const loadData = useCallback(async (preferredId?: string) => {
    setLoading(true)
    const [passageResult, groupResult, questionResult] = await Promise.all([
      supabase.from('passages').select('*').order('passage_part').order('created_at'),
      supabase.from('question_groups').select('*').order('group_order'),
      supabase.from('questions').select('*').order('question_number'),
    ])
    const loadError = passageResult.error ?? groupResult.error ?? questionResult.error
    if (loadError) {
      setError('Không thể tải thư viện bài đọc. Kiểm tra quyền admin và kết nối Supabase.')
      setLoading(false)
      return
    }
    const nextPassages = (passageResult.data ?? []) as Passage[]
    setPassages(nextPassages)
    setGroups((groupResult.data ?? []) as QuestionGroup[])
    setQuestions((questionResult.data ?? []) as Question[])

    if (preferredId !== undefined) {
      setSelectedPassageId(preferredId)
    } else {
      setSelectedPassageId((current) => {
        if (current === 'new') return current
        if (current && nextPassages.some((p) => p.id === current)) return current
        return nextPassages[0]?.id ?? ''
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const activePassage = passages.find((passage) => passage.id === selectedPassageId) ?? null
  const attachedQuestions = useMemo(() => questions.filter((question) => question.passage_id === selectedPassageId), [questions, selectedPassageId])
  const attachedGroups = useMemo<ExamGroup[]>(() => groups
    .filter((group) => group.passage_id === selectedPassageId)
    .map((group) => ({ ...group, questions: questions.filter((question) => question.group_id === group.id) })), [groups, questions, selectedPassageId])

  const effectiveQuestionCount = useMemo(
    () =>
      attachedQuestions.reduce((sum, q) => {
        const group = groups.find((g) => g.id === q.group_id)
        if (group?.input_type === 'check_box' && Array.isArray(q.accepted_answers) && q.accepted_answers.length > 1) {
          return sum + q.accepted_answers.length
        }
        return sum + 1
      }, 0),
    [attachedQuestions, groups],
  )
  const countValid = effectiveQuestionCount === 13 || effectiveQuestionCount === 14

  useEffect(() => {
    if (!activePassage) {
      setTitle('')
      setPart(1)
      setTestOnly(false)
      setContent('')
      setTimeLimit('20')
      return
    }
    setTitle(activePassage.title)
    setPart(activePassage.passage_part)
    setTestOnly(Boolean(activePassage.is_test_only))
    setContent(activePassage.content ?? '')
    setTimeLimit(String(activePassage.time_limit ?? 20))
  }, [activePassage])

  const refreshAndSyncCount = async () => {
    await loadData()
    if (selectedPassageId && selectedPassageId !== 'new') {
      const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('passage_id', selectedPassageId)
      await supabase.from('passages').update({ question_count: count ?? 0 }).eq('id', selectedPassageId)
      await loadData()
    }
  }

  const savePassage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setSaving(true)
    const payload = {
      title: title.trim(),
      passage_part: part,
      is_test_only: testOnly,
      content: sanitizeHtml(content),
      time_limit: Math.max(1, Number(timeLimit) || 20),
      question_count: attachedQuestions.length,
    }
    const result = activePassage
      ? await supabase.from('passages').update(payload).eq('id', activePassage.id).select('id').single()
      : await supabase.from('passages').insert(payload).select('id').single()
    if (result.error) {
      setError('Không thể lưu bài đọc. Hãy kiểm tra dữ liệu và quyền quản trị.')
    } else {
      setNotice(activePassage ? 'Đã cập nhật bài đọc.' : 'Đã tạo bài đọc mới.')
      await loadData(result.data.id)
    }
    setSaving(false)
  }

  const createPassage = () => {
    setSelectedPassageId('new')
    setTitle('')
    setPart(1)
    setTestOnly(false)
    setContent('')
    setTimeLimit('20')
    setNotice(null)
    setError(null)
  }

  const addGroup = async () => {
    if (!activePassage) return
    setError(null)
    const { error: insertError } = await supabase.from('question_groups').insert({
      passage_id: activePassage.id,
      group_order: attachedGroups.length + 1,
      instruction: '',
      question_category: 'True/False/Not Given',
      input_type: 'combo_box',
      shared_content: null,
      shared_options: null,
    })
    if (insertError) setError('Không thể thêm nhóm câu hỏi.')
    else await refreshAndSyncCount()
  }

  const deletePassage = async () => {
    if (!activePassage) return
    setError(null)
    setNotice(null)

    const { data: usedByTests, error: testCheckError } = await supabase
      .from('tests')
      .select('id, title, passage_1_id, passage_2_id, passage_3_id')
      .or(`passage_1_id.eq.${activePassage.id},passage_2_id.eq.${activePassage.id},passage_3_id.eq.${activePassage.id}`)

    if (testCheckError) {
      setError('Không thể kiểm tra đề thi đang sử dụng bài đọc này.')
      return
    }

    const linkedTests = usedByTests ?? []
    const confirmMessage = linkedTests.length
      ? `Bài đọc “${activePassage.title}” đang được dùng trong ${linkedTests.length} đề thi (${linkedTests.map((t) => t.title).join(', ')}).\n\nBạn có chắc chắn muốn gỡ bài đọc này khỏi các đề thi trên và XÓA TOÀN BỘ bài đọc cùng tất cả nhóm câu hỏi và câu hỏi liên quan không?`
      : `Bạn có chắc chắn muốn XÓA TOÀN BỘ bài đọc “${activePassage.title}” cùng tất cả nhóm câu hỏi (${attachedGroups.length} nhóm) và câu hỏi (${attachedQuestions.length} câu)? Hành động này không thể hoàn tác.`

    if (!window.confirm(confirmMessage)) return

    setSaving(true)

    for (const test of linkedTests) {
      const updates: Record<string, null> = {}
      if (test.passage_1_id === activePassage.id) updates.passage_1_id = null
      if (test.passage_2_id === activePassage.id) updates.passage_2_id = null
      if (test.passage_3_id === activePassage.id) updates.passage_3_id = null

      const { error: unlinkError } = await supabase.from('tests').update(updates).eq('id', test.id)
      if (unlinkError) {
        setError(`Không thể gỡ bài đọc khỏi đề "${test.title}".`)
        setSaving(false)
        return
      }
    }

    const { error: questionError } = await supabase.from('questions').delete().eq('passage_id', activePassage.id)
    if (questionError) {
      setError('Không thể xóa danh sách câu hỏi của bài đọc này.')
      setSaving(false)
      return
    }

    const { error: groupError } = await supabase.from('question_groups').delete().eq('passage_id', activePassage.id)
    if (groupError) {
      setError('Không thể xóa các nhóm câu hỏi của bài đọc này.')
      setSaving(false)
      return
    }

    const { error: passageError } = await supabase.from('passages').delete().eq('id', activePassage.id)
    if (passageError) {
      setError('Không thể xóa bài đọc. Vui lòng kiểm tra quyền quản trị.')
      setSaving(false)
      return
    }

    const remaining = passages.filter((p) => p.id !== activePassage.id)
    setNotice(`Đã xóa toàn bộ bài đọc “${activePassage.title}” và các câu hỏi liên quan.`)
    await loadData(remaining[0]?.id ?? '')
    setSaving(false)
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
      <div className="min-w-[260px] flex-1">
        <label htmlFor="passage-picker" className="block text-xs font-semibold leading-4 text-slate-600">
          Bài đọc trong thư viện
        </label>
        <div className="relative mt-1.5 max-w-[540px]">
          <select
            id="passage-picker"
            value={selectedPassageId}
            onChange={(event) => { setSelectedPassageId(event.target.value); setNotice(null); setError(null) }}
            className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-medium text-slate-800 outline-none focus:border-sky-400"
            disabled={!passages.length}
          >
            <option value="" disabled>{passages.length ? 'Chọn bài đọc' : 'Chưa có bài đọc'}</option>
            {passages.map((passage) => <option key={passage.id} value={passage.id}>Passage {passage.passage_part} · {passage.title}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        {activePassage && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void deletePassage()}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border-rose-200 bg-rose-50/70 px-3.5 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
          >
            <Trash2 className="mr-2 size-4" /> Xóa bài đọc &amp; câu hỏi
          </Button>
        )}
        <Button type="button" variant="outline" onClick={createPassage} className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border-slate-200 bg-white px-3.5">
          <CirclePlus className="mr-2 size-4" /> Tạo bài đọc mới
        </Button>
        <Button type="button" onClick={() => setAiModalOpen(true)} className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 px-4 text-white hover:from-sky-700 hover:to-indigo-700">
          <Sparkles className="mr-2 size-4" /> Soạn bài &amp; câu hỏi bằng AI
        </Button>
      </div>
    </div>

    <AIParseTestModal
      open={aiModalOpen}
      onClose={() => setAiModalOpen(false)}
      onSaved={(passageId) => {
        void loadData(passageId).then(() => {
          setNotice('AI đã tạo bài đọc và câu hỏi. Kiểm tra và lưu lại nếu cần.')
          setError(null)
        })
      }}
    />

    {loading && <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Đang tải thư viện…</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

    {!loading && <form onSubmit={(event) => void savePassage(event)} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><BookOpen className="size-5" /></span><div><h3 className="font-bold text-slate-900">{activePassage ? 'Thông tin bài đọc' : 'Bài đọc mới'}</h3><p className="mt-1 text-xs text-slate-500">Nội dung sẽ được hiển thị trong giao diện mô phỏng IELTS.</p></div></div>
        <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${countValid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><span className={`size-2 rounded-full ${countValid ? 'bg-emerald-500' : 'bg-amber-500'}`} />{attachedQuestions.length} câu {countValid ? '· Đạt cấu hình' : '· Cần 13 hoặc 14 câu'}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Tiêu đề<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: The History of Paper" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-50" /></label>
        <label className="text-xs font-semibold text-slate-600">Passage<select value={part} onChange={(event) => setPart(Number(event.target.value) as 1 | 2 | 3)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400">{[1,2,3].map((value) => <option key={value} value={value}>Passage {value}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Phân loại<select value={testOnly ? 'test' : 'practice'} onChange={(event) => setTestOnly(event.target.value === 'test')} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"><option value="test">Chỉ dùng cho Test</option><option value="practice">Luyện tập &amp; Test</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Thời gian luyện tập (phút)<input type="number" min="1" max="90" value={timeLimit} onChange={(event) => setTimeLimit(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" /></label>
      </div>
      <div><label className="mb-2 block text-xs font-semibold text-slate-600">Nội dung bài đọc</label><RichTextEditor label="Nội dung bài đọc" value={content} onChange={setContent} minHeight={300} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        {activePassage ? <Button type="button" variant="ghost" onClick={() => void deletePassage()} disabled={saving} className="rounded-lg text-rose-700 hover:bg-rose-50"><Trash2 className="mr-2 size-4" />Xóa toàn bộ bài đọc &amp; câu hỏi</Button> : <span className="text-xs text-slate-500">Lưu bài đọc trước khi thêm nhóm câu hỏi.</span>}
        <Button type="submit" disabled={saving || !title.trim()} className="h-10 rounded-lg bg-sky-600 px-4 text-white hover:bg-sky-700"><Save className="mr-2 size-4" />{saving ? 'Đang lưu' : activePassage ? 'Lưu thay đổi' : 'Tạo bài đọc'}</Button>
      </div>
    </form>}

    {activePassage && <section aria-labelledby="groups-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Câu hỏi</p><h3 id="groups-heading" className="mt-1 text-lg font-bold text-slate-900">Question Groups</h3><p className="mt-1 text-xs text-slate-500">Nhóm hướng dẫn, nội dung dùng chung và định dạng đáp án.</p></div><Button onClick={() => void addGroup()} className="h-9 rounded-lg bg-sky-600 text-white hover:bg-sky-700"><Plus className="mr-1.5 size-4" />Thêm Question Group</Button></div>
      {attachedGroups.length ? attachedGroups.map((group) => <QuestionGroupManager key={group.id} group={group} onChanged={() => void refreshAndSyncCount()} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-sm font-semibold text-slate-800">Chưa có Question Group</p><p className="mt-1 text-xs text-slate-500">Tạo nhóm đầu tiên để thêm câu hỏi cho bài đọc này.</p><Button onClick={() => void addGroup()} variant="outline" size="sm" className="mt-4 rounded-lg"><Plus className="mr-1.5 size-3.5" />Thêm nhóm đầu tiên</Button></div>}
    </section>}
  </div>
}
