'use client'

import { useState } from 'react'
import { LoaderCircle, Save, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { sanitizeHtml } from '@/lib/sanitize'

const supabase = createClient()

type ParsedQuestion = {
  question_number: number
  question_text: string | null
  options: string[] | null
  accepted_answers: string[]
  explanation: string | null
}

type ParsedGroup = {
  instruction: string
  question_category: string
  input_type: 'combo_box' | 'check_box' | 'text_box'
  shared_content: string | null
  shared_options: string[] | null
  questions: ParsedQuestion[]
}

type ParsedTest = {
  title: string
  passage_number: number
  duration_minutes: number
  passage_content: string
  question_groups: ParsedGroup[]
}

export function AIParseTestModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (passageId: string) => void
}) {
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedTest | null>(null)

  if (!open) return null

  const parseTest = async () => {
    setError(null)
    setParsed(null)
    if (rawText.trim().length < 20) {
      setError('Vui lòng dán nội dung (ít nhất 20 ký tự).')
      return
    }
    setParsing(true)
    try {
      const res = await fetch('/api/ai-parse-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Không thể phân tích bài thi.')
      } else {
        setParsed(data.result as ParsedTest)
      }
    } catch {
      setError('Lỗi kết nối tới server.')
    }
    setParsing(false)
  }

  const saveAll = async () => {
    if (!parsed) return
    setSaving(true)
    setError(null)
    try {
      const passagePart = (parsed.passage_number || 1) as 1 | 2 | 3
      const { data: passageData, error: passageError } = await supabase
        .from('passages')
        .insert({
          title: parsed.title || `Passage ${passagePart}`,
          content: sanitizeHtml(parsed.passage_content),
          passage_part: passagePart,
          question_count: parsed.question_groups.reduce((sum, g) => sum + g.questions.length, 0),
          is_test_only: false,
          time_limit: parsed.duration_minutes || 20,
        })
        .select('id')
        .single()

      if (passageError || !passageData) {
        setError('Không thể tạo bài đọc. Kiểm tra quyền admin.')
        setSaving(false)
        return
      }

      const passageId = passageData.id

      for (let gi = 0; gi < parsed.question_groups.length; gi++) {
        const group = parsed.question_groups[gi]
        const { data: groupData, error: groupError } = await supabase
          .from('question_groups')
          .insert({
            passage_id: passageId,
            group_order: gi + 1,
            instruction: sanitizeHtml(group.instruction),
            question_category: group.question_category,
            input_type: group.input_type,
            shared_content: group.shared_content ? sanitizeHtml(group.shared_content) : null,
            shared_options: group.shared_options ?? null,
          })
          .select('id')
          .single()

        if (groupError || !groupData) {
          setError(`Không thể tạo nhóm câu hỏi ${gi + 1}.`)
          setSaving(false)
          return
        }

        const groupId = groupData.id
        const questionRows = group.questions.map((q) => ({
          passage_id: passageId,
          group_id: groupId,
          question_number: q.question_number,
          question_text: q.question_text?.trim() || null,
          options: q.options ?? null,
          accepted_answers: q.accepted_answers,
          explanation: q.explanation?.trim() || null,
        }))

        const { error: qError } = await supabase.from('questions').insert(questionRows)
        if (qError) {
          setError(`Không thể tạo câu hỏi cho nhóm ${gi + 1}.`)
          setSaving(false)
          return
        }
      }

      setParsed(null)
      setRawText('')
      onSaved(passageId)
      onClose()
    } catch {
      setError('Lỗi không xác định khi lưu.')
    }
    setSaving(false)
  }

  const reset = () => {
    setParsed(null)
    setRawText('')
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ai-parse-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 text-white"><Sparkles className="size-5" /></span>
            <div><h2 id="ai-parse-title" className="text-lg font-bold text-slate-900">AI Tự Động Tạo Đề</h2><p className="text-xs text-slate-500">Dán văn bản thô — AI sẽ phân tích và tạo cấu trúc bài thi</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng"><X className="size-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!parsed && (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Dán nội dung bài thi (Passage + Questions + Answer Keys)</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={14}
                placeholder="Dán toàn bộ văn bản bài đọc, câu hỏi, đáp án và giải thích vào đây..."
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
              />
              <p className="text-xs text-slate-500">AI sẽ tự động nhận dạng passage, nhóm câu hỏi theo dạng, trích xuất đáp án và tạo giải thích tiếng Việt.</p>
            </div>
          )}

          {parsed && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-sky-600">Passage {parsed.passage_number}</p><h3 className="mt-1 text-base font-bold text-slate-900">{parsed.title || '(Không có tiêu đề)'}</h3></div>
                  <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{parsed.question_groups.reduce((s, g) => s + g.questions.length, 0)} câu · {parsed.duration_minutes || 20} phút</span>
                </div>
                <div className="rich-content mt-3 max-h-48 overflow-y-auto rounded-lg bg-white p-3 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(parsed.passage_content) }} />
              </div>

              {parsed.question_groups.map((group, gi) => (
                <div key={gi} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-700">{group.question_category}</span>
                    <span className="text-xs text-slate-500">{group.input_type} · {group.questions.length} câu</span>
                  </div>
                  {group.instruction && <p className="mb-2 text-xs font-medium text-slate-600">{group.instruction}</p>}
                  {group.shared_options && <div className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{group.shared_options.join(' | ')}</div>}
                  <ul className="space-y-1.5">
                    {group.questions.map((q) => (
                      <li key={q.question_number} className="flex items-start gap-2 text-sm">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">{q.question_number}</span>
                        <div className="min-w-0 flex-1">
                          {q.question_text && <p className="text-slate-800">{q.question_text}</p>}
                          {q.options && <p className="mt-0.5 text-xs text-slate-500">{q.options.join(' | ')}</p>}
                          <p className="mt-0.5 text-xs font-semibold text-emerald-700">Đáp án: {q.accepted_answers.join(' / ')}</p>
                          {q.explanation && <p className="mt-0.5 text-xs text-slate-500">{q.explanation}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {parsed ? (
            <>
              <Button variant="outline" onClick={reset} className="rounded-lg">Phân tích lại</Button>
              <Button onClick={() => void saveAll()} disabled={saving} className="rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                {saving ? 'Đang lưu...' : 'Lưu toàn bộ vào hệ thống'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} className="rounded-lg">Hủy</Button>
              <Button onClick={() => void parseTest()} disabled={parsing} className="rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:from-sky-700 hover:to-indigo-700">
                {parsing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                {parsing ? 'AI đang phân tích...' : 'Phân tích bằng AI'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
